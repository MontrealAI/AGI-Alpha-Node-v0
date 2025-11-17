import pino from 'pino';
import { roundTo } from '../constants/workUnits.js';
import { initializeDatabase } from '../persistence/database.js';
import {
  IndexConstituentExclusionRepository,
  IndexConstituentWeightRepository,
  IndexValueRepository,
  IndexWeightSetRepository,
  ProviderRepository,
  SyntheticLaborScoreRepository
} from '../persistence/repositories.js';

function toDateOnly(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function addDays(date, offset) {
  const parsed = toDateOnly(date);
  if (!parsed) return null;
  const d = new Date(parsed);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function enumerateDates(startDate, endDate) {
  const start = toDateOnly(startDate);
  const end = toDateOnly(endDate);
  if (!start || !end) return [];
  const dates = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function differenceInDays(later, earlier) {
  const end = toDateOnly(later);
  const start = toDateOnly(earlier);
  if (!end || !start) return 0;
  const diffMs = Date.parse(end) - Date.parse(start);
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

function normalizeWeights(rawWeights) {
  const total = rawWeights.reduce((acc, entry) => acc + entry.weight, 0);
  if (total <= 0) return [];
  return rawWeights.map((entry) => ({ ...entry, weight: entry.weight / total }));
}

function applyCap(rawWeights, capFraction) {
  let remaining = 1;
  let uncapped = [...rawWeights];
  const results = new Map();

  while (uncapped.length > 0) {
    const total = uncapped.reduce((acc, entry) => acc + entry.weight, 0);
    if (total <= 0) {
      for (const entry of uncapped) {
        results.set(entry.provider_id, 0);
      }
      break;
    }

    let cappedThisPass = false;
    const nextPass = [];
    for (const entry of uncapped) {
      const proportional = (entry.weight / total) * remaining;
      if (proportional > capFraction) {
        results.set(entry.provider_id, { weight: capFraction, capped: true });
        remaining -= capFraction;
        cappedThisPass = true;
      } else {
        nextPass.push({ ...entry, weight: proportional, capped: entry.capped || false });
      }
    }

    if (!cappedThisPass) {
      for (const entry of nextPass) {
        results.set(entry.provider_id, { weight: entry.weight, capped: entry.capped || false });
      }
      remaining = 0;
      break;
    }

    uncapped = nextPass.filter((entry) => entry.weight > 0);
    if (remaining <= 0) break;
  }

  const normalizedTotal = Array.from(results.values()).reduce((acc, value) => acc + value.weight, 0);
  if (normalizedTotal === 0) return [];
  const scale = normalizedTotal > 1 ? 1 / normalizedTotal : 1;
  return Array.from(results.entries()).map(([provider_id, entry]) => ({
    provider_id,
    weight: entry.weight * scale,
    capped: entry.capped || entry.weight >= capFraction
  }));
}

const defaultLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  name: 'gsl-index',
  base: { component: 'gsl-index' }
});

export class GlobalSyntheticLaborIndex {
  constructor({ db = null, logger = defaultLogger } = {}) {
    this.db = db ?? initializeDatabase({ withSeed: true });
    this.logger = logger?.child?.({ component: 'gsl-index' }) ?? logger;
    this.providers = new ProviderRepository(this.db);
    this.syntheticLaborScores = new SyntheticLaborScoreRepository(this.db);
    this.weightSets = new IndexWeightSetRepository(this.db);
    this.constituentWeights = new IndexConstituentWeightRepository(this.db);
    this.exclusions = new IndexConstituentExclusionRepository(this.db);
    this.indexValues = new IndexValueRepository(this.db);
  }

  #resolveWindow(asOfDate, days) {
    const end = toDateOnly(asOfDate) ?? new Date().toISOString().slice(0, 10);
    const start = addDays(end, -1 * (days - 1));
    return { start, end };
  }

  selectEligibleProviders({ asOfDate, minimumSlu30d = 1, lookbackDays = 30 }) {
    const window = this.#resolveWindow(asOfDate, lookbackDays);
    const aggregates = this.syntheticLaborScores.sumSluByProvider(window.start, window.end);
    const observed = new Map(aggregates.map((entry) => [entry.provider_id, entry]));
    const providers = this.providers.list();

    const eligible = [];
    const excluded = [];

    for (const provider of providers) {
      const aggregate = observed.get(provider.id);
      const total = aggregate?.total_slu ?? 0;
      const daysObserved = aggregate?.days_observed ?? 0;

      if (total >= minimumSlu30d) {
        eligible.push({ provider, total_slu: total, days_observed: daysObserved });
      } else if (daysObserved === 0) {
        excluded.push({ provider, reason: 'no_observed_history', observed_slu: total, days_observed: daysObserved });
      } else {
        excluded.push({ provider, reason: 'below_minimum_slu_30d', observed_slu: total, days_observed: daysObserved });
      }
    }

    return { eligible, excluded, window };
  }

  rebalance({ asOfDate, capPercent = 15, lookbackDays = 90, minimumSlu30d = 1, baseDivisor = 1, divisorVersion = 'v1' }) {
    const context = { asOfDate, capPercent, lookbackDays, minimumSlu30d, baseDivisor, divisorVersion };
    try {
    const capFraction = capPercent / 100;
    const eligibility = this.selectEligibleProviders({ asOfDate, minimumSlu30d });
    const lookbackWindow = this.#resolveWindow(asOfDate, lookbackDays);
    const aggregates = this.syntheticLaborScores.sumSluByProvider(lookbackWindow.start, lookbackWindow.end);
    const aggregateMap = new Map(aggregates.map((entry) => [entry.provider_id, entry.total_slu]));

    const rawWeights = eligibility.eligible
      .map((entry) => ({ provider_id: entry.provider.id, weight: aggregateMap.get(entry.provider.id) ?? 0 }))
      .filter((entry) => entry.weight > 0);

    const normalized = normalizeWeights(rawWeights);
    const capped = applyCap(normalized, capFraction);

    const weightSet = this.weightSets.create({
      effective_date: toDateOnly(asOfDate) ?? new Date().toISOString().slice(0, 10),
      lookback_window_days: lookbackDays,
      cap: capFraction,
      base_divisor: baseDivisor,
      divisor_version: divisorVersion,
      metadata: {
        eligibility_window: eligibility.window,
        minimumSlu30d,
        lookback_window: lookbackWindow,
        eligible_provider_ids: eligibility.eligible.map((entry) => entry.provider.id),
        excluded_provider_ids: eligibility.excluded.map((entry) => entry.provider.id),
        cap_fraction: capFraction
      }
    });

    for (const exclusion of eligibility.excluded) {
      this.exclusions.create({
        weight_set_id: weightSet.id,
        provider_id: exclusion.provider.id,
        reason: exclusion.reason,
        metadata: {
          observed_slu: exclusion.observed_slu,
          days_observed: exclusion.days_observed,
          eligibility_window: eligibility.window
        }
      });
    }

    for (const weight of capped) {
      this.constituentWeights.create({
        weight_set_id: weightSet.id,
        provider_id: weight.provider_id,
        weight: roundTo(weight.weight, 6),
        metadata: { capped: Boolean(weight.capped) }
      });
    }

    this.logger?.info?.(
      {
        event: 'gslIndex.rebalance',
        asOfDate: weightSet.effective_date,
        capPercent,
        lookbackDays,
        minimumSlu30d,
        baseDivisor,
        divisorVersion,
        eligibleProviders: eligibility.eligible.length,
        excludedProviders: eligibility.excluded.length,
        weightSetId: weightSet.id
      },
      'Rebalanced global synthetic labor index weights'
    );

    return weightSet;
    } catch (error) {
      this.logger?.error?.(
        { event: 'gslIndex.rebalance.error', ...context, error: error?.message, stack: error?.stack },
        'Failed to rebalance GSLI weights'
      );
      throw error;
    }
  }

  computeIndexValue(measurementDate, weightSetId = null) {
    const context = { measurementDate, weightSetId };
    try {
      const dateOnly = toDateOnly(measurementDate) ?? new Date().toISOString().slice(0, 10);
      const weightSet = weightSetId ? this.weightSets.getById(weightSetId) : this.weightSets.findLatest();
      if (!weightSet) {
        throw new Error('No weight set available; rebalance before computing index values');
      }

      const weights = this.constituentWeights.listForWeightSet(weightSet.id);
      const scores = this.syntheticLaborScores.listForDate(dateOnly);
      const scoreMap = new Map(scores.map((entry) => [entry.provider_id, entry.slu]));

      let headline = 0;
      for (const weight of weights) {
        const slu = scoreMap.get(weight.provider_id) ?? 0;
        headline += weight.weight * slu;
      }

      const normalizedHeadline = roundTo(headline / (weightSet.base_divisor || 1), 6);
      const indexValue = this.indexValues.create({
        effective_date: dateOnly,
        headline_value: normalizedHeadline,
        energy_adjustment: 1,
        quality_adjustment: 1,
        consensus_factor: 1,
        weight_set_id: weightSet.id,
        base_divisor: weightSet.base_divisor ?? 1,
        divisor_version: weightSet.divisor_version ?? 'v1'
      });

      this.logger?.info?.(
        {
          event: 'gslIndex.headline',
          effectiveDate: dateOnly,
          weightSetId: weightSet.id,
          headline: normalizedHeadline
        },
        'Computed headline GSLI value'
      );

      return indexValue;
    } catch (error) {
      this.logger?.error?.(
        { event: 'gslIndex.headline.error', ...context, error: error?.message, stack: error?.stack },
        'Failed to compute GSLI headline value'
      );
      throw error;
    }
  }

  backfillIndexHistory({
    startDate,
    endDate,
    capPercent = 15,
    minimumSlu30d = 1,
    lookbackDays = 90,
    rebalanceIntervalDays = 30,
    baseDivisor = 1,
    divisorVersion = 'v1'
  }) {
    const context = { startDate, endDate, capPercent, minimumSlu30d, lookbackDays, rebalanceIntervalDays, baseDivisor, divisorVersion };
    try {
      const dates = enumerateDates(startDate, endDate);
      if (dates.length === 0) {
        return { weightSets: [], indexValues: [] };
      }

      let activeWeightSet = null;
      const history = [];

      for (const date of dates) {
        if (
          !activeWeightSet ||
          differenceInDays(date, activeWeightSet.effective_date) >= rebalanceIntervalDays
        ) {
          activeWeightSet = this.rebalance({
            asOfDate: date,
            capPercent,
            lookbackDays,
            minimumSlu30d,
            baseDivisor,
            divisorVersion
          });
        }

        history.push(
          this.computeIndexValue(date, activeWeightSet.id)
        );
      }

      this.logger?.info?.({
        event: 'gslIndex.backfill.complete',
        startDate,
        endDate,
        rebalanceIntervalDays,
        totalDays: dates.length,
        weightSets: this.weightSets.listRecent(dates.length).length
      }, 'Completed GSLI backfill');

      return { weightSets: this.weightSets.listRecent(dates.length), indexValues: history };
    } catch (error) {
      this.logger?.error?.(
        { event: 'gslIndex.backfill.error', ...context, error: error?.message, stack: error?.stack },
        'Failed to backfill GSLI history'
      );
      throw error;
    }
  }
}

export function createGlobalIndexEngine(options = {}) {
  return new GlobalSyntheticLaborIndex(options);
}
