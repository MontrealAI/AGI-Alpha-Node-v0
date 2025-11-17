function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function serializeJson(value) {
  return JSON.stringify(value ?? {});
}

function serializeTags(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

export class ProviderRepository {
  constructor(db) {
    this.db = db;
  }

  create(provider) {
    const stmt = this.db.prepare(`
      INSERT INTO providers (name, operator_address, region, sector_tags, energy_mix, metadata)
      VALUES (@name, @operator_address, @region, @sector_tags, @energy_mix, @metadata)
    `);
    const result = stmt.run({
      ...provider,
      sector_tags: serializeTags(provider.sector_tags),
      metadata: serializeJson(provider.metadata)
    });
    return this.getById(result.lastInsertRowid);
  }

  update(id, updates) {
    const stmt = this.db.prepare(`
      UPDATE providers
      SET name = COALESCE(@name, name),
          operator_address = COALESCE(@operator_address, operator_address),
          region = COALESCE(@region, region),
          sector_tags = COALESCE(@sector_tags, sector_tags),
          energy_mix = COALESCE(@energy_mix, energy_mix),
          metadata = COALESCE(@metadata, metadata),
          updated_at = datetime('now')
      WHERE id = @id
    `);
    stmt.run({
      id,
      name: updates.name ?? null,
      operator_address: updates.operator_address ?? null,
      region: updates.region ?? null,
      sector_tags:
        updates.sector_tags !== undefined ? serializeTags(updates.sector_tags) : updates.sector_tags ?? null,
      energy_mix: updates.energy_mix ?? null,
      metadata: updates.metadata !== undefined ? serializeJson(updates.metadata) : updates.metadata ?? null
    });
    return this.getById(id);
  }

  getById(id) {
    const row = this.db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
    return row ? this.#map(row) : undefined;
  }

  findByName(name) {
    const row = this.db.prepare('SELECT * FROM providers WHERE name = ?').get(name);
    return row ? this.#map(row) : undefined;
  }

  list() {
    return this.db
      .prepare('SELECT * FROM providers ORDER BY created_at DESC')
      .all()
      .map((row) => this.#map(row));
  }

  #map(row) {
    return {
      ...row,
      sector_tags: parseJson(row.sector_tags, []),
      metadata: parseJson(row.metadata, {})
    };
  }
}

export class ProviderApiKeyRepository {
  constructor(db) {
    this.db = db;
  }

  create(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO provider_api_keys (provider_id, hashed_key, label, rate_limit_quota)
      VALUES (@provider_id, @hashed_key, @label, @rate_limit_quota)
    `);
    const result = stmt.run({
      ...entry,
      rate_limit_quota: entry.rate_limit_quota ?? 1200
    });
    return this.getById(result.lastInsertRowid);
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM provider_api_keys WHERE id = ?').get(id);
  }

  findActiveByHash(hashedKey) {
    return this.db
      .prepare('SELECT * FROM provider_api_keys WHERE hashed_key = ? AND revoked_at IS NULL')
      .get(hashedKey);
  }

  touchLastUsed(id) {
    this.db.prepare("UPDATE provider_api_keys SET last_used_at = datetime('now') WHERE id = ?").run(id);
    return this.getById(id);
  }

  revoke(id) {
    this.db.prepare("UPDATE provider_api_keys SET revoked_at = datetime('now') WHERE id = ?").run(id);
    return this.getById(id);
  }
}

export class TaskTypeRepository {
  constructor(db) {
    this.db = db;
  }

  create(taskType) {
    const stmt = this.db.prepare(`
      INSERT INTO task_types (name, description, difficulty_coefficient)
      VALUES (@name, @description, @difficulty_coefficient)
    `);
    const result = stmt.run(taskType);
    return this.getById(result.lastInsertRowid);
  }

  update(id, updates) {
    const stmt = this.db.prepare(`
      UPDATE task_types
      SET name = COALESCE(@name, name),
          description = COALESCE(@description, description),
          difficulty_coefficient = COALESCE(@difficulty_coefficient, difficulty_coefficient),
          updated_at = datetime('now')
      WHERE id = @id
    `);
    stmt.run({
      id,
      name: updates.name ?? null,
      description: updates.description ?? null,
      difficulty_coefficient: updates.difficulty_coefficient ?? null
    });
    return this.getById(id);
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM task_types WHERE id = ?').get(id);
  }

  findByName(name) {
    return this.db.prepare('SELECT * FROM task_types WHERE name = ?').get(name);
  }

  list() {
    return this.db.prepare('SELECT * FROM task_types ORDER BY created_at DESC').all();
  }
}

export class TaskRunRepository {
  constructor(db) {
    this.db = db;
  }

  create(taskRun) {
    const stmt = this.db.prepare(`
      INSERT INTO task_runs (provider_id, task_type_id, external_id, status, raw_throughput, tokens_processed, tool_calls, novelty_score, quality_score, started_at, completed_at, idempotency_key, schema_version, payload_hash, metadata)
      VALUES (@provider_id, @task_type_id, @external_id, @status, @raw_throughput, @tokens_processed, @tool_calls, @novelty_score, @quality_score, @started_at, @completed_at, @idempotency_key, @schema_version, @payload_hash, @metadata)
    `);
    const result = stmt.run({
      provider_id: taskRun.provider_id,
      task_type_id: taskRun.task_type_id ?? null,
      external_id: taskRun.external_id ?? null,
      status: taskRun.status ?? 'queued',
      raw_throughput: taskRun.raw_throughput ?? 0,
      tokens_processed: taskRun.tokens_processed ?? 0,
      tool_calls: taskRun.tool_calls ?? 0,
      novelty_score: taskRun.novelty_score ?? null,
      quality_score: taskRun.quality_score ?? null,
      started_at: taskRun.started_at ?? null,
      completed_at: taskRun.completed_at ?? null,
      idempotency_key: taskRun.idempotency_key ?? null,
      schema_version: taskRun.schema_version ?? null,
      payload_hash: taskRun.payload_hash ?? null,
      metadata: taskRun.metadata ? serializeJson(taskRun.metadata) : null
    });
    return this.getById(result.lastInsertRowid);
  }

  update(id, updates) {
    const stmt = this.db.prepare(`
      UPDATE task_runs
      SET status = COALESCE(@status, status),
          raw_throughput = COALESCE(@raw_throughput, raw_throughput),
          tokens_processed = COALESCE(@tokens_processed, tokens_processed),
          tool_calls = COALESCE(@tool_calls, tool_calls),
          novelty_score = COALESCE(@novelty_score, novelty_score),
          quality_score = COALESCE(@quality_score, quality_score),
          started_at = COALESCE(@started_at, started_at),
          completed_at = COALESCE(@completed_at, completed_at),
          idempotency_key = COALESCE(@idempotency_key, idempotency_key),
          schema_version = COALESCE(@schema_version, schema_version),
          payload_hash = COALESCE(@payload_hash, payload_hash),
          metadata = COALESCE(@metadata, metadata),
          updated_at = datetime('now')
      WHERE id = @id
    `);
    stmt.run({
      id,
      status: updates.status ?? null,
      raw_throughput: updates.raw_throughput ?? null,
      tokens_processed: updates.tokens_processed ?? null,
      tool_calls: updates.tool_calls ?? null,
      novelty_score: updates.novelty_score ?? null,
      quality_score: updates.quality_score ?? null,
      started_at: updates.started_at ?? null,
      completed_at: updates.completed_at ?? null,
      idempotency_key: updates.idempotency_key ?? null,
      schema_version: updates.schema_version ?? null,
      payload_hash: updates.payload_hash ?? null,
      metadata: updates.metadata ? serializeJson(updates.metadata) : null
    });
    return this.getById(id);
  }

  getById(id) {
    const row = this.db.prepare('SELECT * FROM task_runs WHERE id = ?').get(id);
    return row ? this.#map(row) : undefined;
  }

  listByProvider(providerId) {
    return this.db
      .prepare('SELECT * FROM task_runs WHERE provider_id = ? ORDER BY created_at DESC')
      .all(providerId)
      .map((row) => this.#map(row));
  }

  findByExternalId(providerId, externalId) {
    const row = this.db
      .prepare('SELECT * FROM task_runs WHERE provider_id = ? AND external_id = ?')
      .get(providerId, externalId);
    return row ? this.#map(row) : undefined;
  }

  findByIdempotencyKey(providerId, idempotencyKey) {
    const row = this.db
      .prepare('SELECT * FROM task_runs WHERE provider_id = ? AND idempotency_key = ?')
      .get(providerId, idempotencyKey);
    return row ? this.#map(row) : undefined;
  }

  #map(row) {
    return {
      ...row,
      metadata: parseJson(row.metadata, {})
    };
  }
}

export class QualityEvaluationRepository {
  constructor(db) {
    this.db = db;
  }

  create(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO quality_evaluations (task_run_id, evaluator, score, notes, schema_version, metadata)
      VALUES (@task_run_id, @evaluator, @score, @notes, @schema_version, @metadata)
    `);
    const result = stmt.run({
      ...entry,
      schema_version: entry.schema_version ?? null,
      metadata: entry.metadata ? serializeJson(entry.metadata) : null
    });
    return this.getById(result.lastInsertRowid);
  }

  update(id, updates) {
    const stmt = this.db.prepare(`
      UPDATE quality_evaluations
      SET evaluator = COALESCE(@evaluator, evaluator),
          score = COALESCE(@score, score),
          notes = COALESCE(@notes, notes),
          schema_version = COALESCE(@schema_version, schema_version),
          metadata = COALESCE(@metadata, metadata),
          updated_at = datetime('now')
      WHERE id = @id
    `);

    stmt.run({
      id,
      evaluator: updates.evaluator ?? null,
      score: updates.score ?? null,
      notes: updates.notes ?? null,
      schema_version: updates.schema_version ?? null,
      metadata: updates.metadata ? serializeJson(updates.metadata) : null
    });

    return this.getById(id);
  }

  getById(id) {
    const row = this.db.prepare('SELECT * FROM quality_evaluations WHERE id = ?').get(id);
    return row ? this.#map(row) : undefined;
  }

  listForTaskRun(taskRunId) {
    return this.db
      .prepare('SELECT * FROM quality_evaluations WHERE task_run_id = ? ORDER BY created_at DESC')
      .all(taskRunId)
      .map((row) => this.#map(row));
  }

  #map(row) {
    return {
      ...row,
      metadata: parseJson(row.metadata, {})
    };
  }
}

export class EnergyReportRepository {
  constructor(db) {
    this.db = db;
  }

  create(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO energy_reports (task_run_id, kwh, energy_mix, carbon_intensity_gco2_kwh, cost_usd, region, schema_version, metadata)
      VALUES (@task_run_id, @kwh, @energy_mix, @carbon_intensity_gco2_kwh, @cost_usd, @region, @schema_version, @metadata)
    `);
    const result = stmt.run({
      ...entry,
      schema_version: entry.schema_version ?? null,
      metadata: entry.metadata ? serializeJson(entry.metadata) : null
    });
    return this.getById(result.lastInsertRowid);
  }

  update(id, updates) {
    const stmt = this.db.prepare(`
      UPDATE energy_reports
      SET kwh = COALESCE(@kwh, kwh),
          energy_mix = COALESCE(@energy_mix, energy_mix),
          carbon_intensity_gco2_kwh = COALESCE(@carbon_intensity_gco2_kwh, carbon_intensity_gco2_kwh),
          cost_usd = COALESCE(@cost_usd, cost_usd),
          region = COALESCE(@region, region),
          schema_version = COALESCE(@schema_version, schema_version),
          metadata = COALESCE(@metadata, metadata),
          updated_at = datetime('now')
      WHERE id = @id
    `);

    stmt.run({
      id,
      kwh: updates.kwh ?? null,
      energy_mix: updates.energy_mix ?? null,
      carbon_intensity_gco2_kwh: updates.carbon_intensity_gco2_kwh ?? null,
      cost_usd: updates.cost_usd ?? null,
      region: updates.region ?? null,
      schema_version: updates.schema_version ?? null,
      metadata: updates.metadata ? serializeJson(updates.metadata) : null
    });

    return this.getById(id);
  }

  getById(id) {
    const row = this.db.prepare('SELECT * FROM energy_reports WHERE id = ?').get(id);
    return row ? this.#map(row) : undefined;
  }

  listForTaskRun(taskRunId) {
    return this.db
      .prepare('SELECT * FROM energy_reports WHERE task_run_id = ? ORDER BY created_at DESC')
      .all(taskRunId)
      .map((row) => this.#map(row));
  }

  #map(row) {
    return {
      ...row,
      metadata: parseJson(row.metadata, {})
    };
  }
}

export class SyntheticLaborScoreRepository {
  constructor(db) {
    this.db = db;
  }

  create(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO synthetic_labor_scores (
        provider_id,
        task_run_id,
        measurement_date,
        raw_throughput,
        energy_adjustment,
        quality_adjustment,
        consensus_factor,
        slu,
        rationale,
        schema_version,
        metadata
      )
      VALUES (
        @provider_id,
        @task_run_id,
        @measurement_date,
        @raw_throughput,
        @energy_adjustment,
        @quality_adjustment,
        @consensus_factor,
        @slu,
        @rationale,
        @schema_version,
        @metadata
      )
    `);
    const result = stmt.run({
      provider_id: entry.provider_id,
      task_run_id: entry.task_run_id ?? null,
      measurement_date: entry.measurement_date ?? new Date().toISOString().slice(0, 10),
      raw_throughput: entry.raw_throughput ?? 0,
      energy_adjustment: entry.energy_adjustment ?? 1,
      quality_adjustment: entry.quality_adjustment ?? 1,
      consensus_factor: entry.consensus_factor ?? 1,
      slu: entry.slu ?? 0,
      rationale: entry.rationale ?? null,
      schema_version: entry.schema_version ?? null,
      metadata: entry.metadata ? serializeJson(entry.metadata) : null
    });
    return this.getById(result.lastInsertRowid);
  }

  update(id, updates) {
    const stmt = this.db.prepare(`
      UPDATE synthetic_labor_scores
      SET provider_id = COALESCE(@provider_id, provider_id),
          task_run_id = COALESCE(@task_run_id, task_run_id),
          measurement_date = COALESCE(@measurement_date, measurement_date),
          raw_throughput = COALESCE(@raw_throughput, raw_throughput),
          energy_adjustment = COALESCE(@energy_adjustment, energy_adjustment),
          quality_adjustment = COALESCE(@quality_adjustment, quality_adjustment),
          consensus_factor = COALESCE(@consensus_factor, consensus_factor),
          slu = COALESCE(@slu, slu),
          rationale = COALESCE(@rationale, rationale),
          schema_version = COALESCE(@schema_version, schema_version),
          metadata = COALESCE(@metadata, metadata),
          updated_at = datetime('now')
      WHERE id = @id
    `);

    stmt.run({
      id,
      provider_id: updates.provider_id ?? null,
      task_run_id: updates.task_run_id ?? null,
      measurement_date: updates.measurement_date ?? null,
      raw_throughput: updates.raw_throughput ?? null,
      energy_adjustment: updates.energy_adjustment ?? null,
      quality_adjustment: updates.quality_adjustment ?? null,
      consensus_factor: updates.consensus_factor ?? null,
      slu: updates.slu ?? null,
      rationale: updates.rationale ?? null,
      schema_version: updates.schema_version ?? null,
      metadata: updates.metadata ? serializeJson(updates.metadata) : null
    });

    return this.getById(id);
  }

  getById(id) {
    const row = this.db.prepare('SELECT * FROM synthetic_labor_scores WHERE id = ?').get(id);
    return row ? this.#map(row) : undefined;
  }

  listForProvider(providerId) {
    return this.db
      .prepare('SELECT * FROM synthetic_labor_scores WHERE provider_id = ? ORDER BY measurement_date DESC, created_at DESC')
      .all(providerId)
      .map((row) => this.#map(row));
  }

  findLatestForProvider(providerId) {
    const row = this.db
      .prepare(
        `SELECT * FROM synthetic_labor_scores
         WHERE provider_id = @providerId
         ORDER BY measurement_date DESC, created_at DESC
         LIMIT 1`
      )
      .get({ providerId });
    return row ? this.#map(row) : undefined;
  }

  findByProviderAndDate(providerId, measurementDate) {
    const row = this.db
      .prepare(
        'SELECT * FROM synthetic_labor_scores WHERE provider_id = ? AND measurement_date = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(providerId, measurementDate);
    return row ? this.#map(row) : undefined;
  }

  listInDateRange(startDate, endDate) {
    return this.db
      .prepare(
        `SELECT * FROM synthetic_labor_scores
         WHERE measurement_date BETWEEN @start AND @end
         ORDER BY measurement_date ASC, provider_id ASC`
      )
      .all({ start: startDate, end: endDate })
      .map((row) => this.#map(row));
  }

  sumSluByProvider(startDate, endDate) {
    return this.db
      .prepare(
        `SELECT provider_id, SUM(slu) as total_slu, COUNT(DISTINCT measurement_date) as days_observed
         FROM synthetic_labor_scores
         WHERE measurement_date BETWEEN @start AND @end
         GROUP BY provider_id`
      )
      .all({ start: startDate, end: endDate })
      .map((row) => ({
        provider_id: row.provider_id,
        total_slu: Number(row.total_slu ?? 0),
        days_observed: Number(row.days_observed ?? 0)
      }));
  }

  listForDate(measurementDate) {
    return this.db
      .prepare('SELECT * FROM synthetic_labor_scores WHERE measurement_date = ? ORDER BY provider_id ASC')
      .all(measurementDate)
      .map((row) => this.#map(row));
  }

  listForProviderBetween(providerId, startDate, endDate, { limit = 30, offset = 0 } = {}) {
    return this.db
      .prepare(
        `SELECT * FROM synthetic_labor_scores
         WHERE provider_id = @providerId
           AND measurement_date BETWEEN @start AND @end
         ORDER BY measurement_date DESC, created_at DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ providerId, start: startDate, end: endDate, limit, offset })
      .map((row) => this.#map(row));
  }

  countForProviderBetween(providerId, startDate, endDate) {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count
         FROM synthetic_labor_scores
         WHERE provider_id = @providerId
           AND measurement_date BETWEEN @start AND @end`
      )
      .get({ providerId, start: startDate, end: endDate });
    return Number(row?.count ?? 0);
  }

  #map(row) {
    return {
      ...row,
      metadata: parseJson(row.metadata, {})
    };
  }
}

export class IndexValueRepository {
  constructor(db) {
    this.db = db;
  }

  create(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO index_values (
        effective_date,
        headline_value,
        energy_adjustment,
        quality_adjustment,
        consensus_factor,
        weight_set_id,
        base_divisor,
        divisor_version
      )
      VALUES (
        @effective_date,
        @headline_value,
        @energy_adjustment,
        @quality_adjustment,
        @consensus_factor,
        @weight_set_id,
        @base_divisor,
        @divisor_version
      )
    `);
    const result = stmt.run({
      ...entry,
      weight_set_id: entry.weight_set_id ?? null,
      base_divisor: entry.base_divisor ?? 1,
      divisor_version: entry.divisor_version ?? 'v1'
    });
    return this.getById(result.lastInsertRowid);
  }

  update(id, updates) {
    const stmt = this.db.prepare(`
      UPDATE index_values
      SET effective_date = COALESCE(@effective_date, effective_date),
          headline_value = COALESCE(@headline_value, headline_value),
          energy_adjustment = COALESCE(@energy_adjustment, energy_adjustment),
          quality_adjustment = COALESCE(@quality_adjustment, quality_adjustment),
          consensus_factor = COALESCE(@consensus_factor, consensus_factor),
          weight_set_id = COALESCE(@weight_set_id, weight_set_id),
          base_divisor = COALESCE(@base_divisor, base_divisor),
          divisor_version = COALESCE(@divisor_version, divisor_version),
          updated_at = datetime('now')
      WHERE id = @id
    `);

    stmt.run({
      id,
      effective_date: updates.effective_date ?? null,
      headline_value: updates.headline_value ?? null,
      energy_adjustment: updates.energy_adjustment ?? null,
      quality_adjustment: updates.quality_adjustment ?? null,
      consensus_factor: updates.consensus_factor ?? null,
      weight_set_id: updates.weight_set_id ?? null,
      base_divisor: updates.base_divisor ?? null,
      divisor_version: updates.divisor_version ?? null
    });

    return this.getById(id);
  }

  countBetween(startDate, endDate) {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM index_values WHERE effective_date BETWEEN @start AND @end')
      .get({ start: startDate, end: endDate });
    return Number(row?.count ?? 0);
  }

  getById(id) {
    return this.db.prepare('SELECT * FROM index_values WHERE id = ?').get(id);
  }

  findByDate(effectiveDate) {
    return this.db.prepare('SELECT * FROM index_values WHERE effective_date = ?').get(effectiveDate);
  }

  listRecent(limit = 30) {
    return this.db
      .prepare('SELECT * FROM index_values ORDER BY effective_date DESC, created_at DESC LIMIT ?')
      .all(limit);
  }

  listBetween(startDate, endDate, { limit = 30, offset = 0 } = {}) {
    return this.db
      .prepare(
        `SELECT *
         FROM index_values
         WHERE effective_date BETWEEN @start AND @end
         ORDER BY effective_date DESC, created_at DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ start: startDate, end: endDate, limit, offset });
  }
}

export class IndexConstituentWeightRepository {
  constructor(db) {
    this.db = db;
  }

  create(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO index_constituent_weights (weight_set_id, index_value_id, provider_id, weight, metadata)
      VALUES (@weight_set_id, @index_value_id, @provider_id, @weight, @metadata)
    `);
    const result = stmt.run({
      ...entry,
      weight_set_id: entry.weight_set_id ?? null,
      index_value_id: entry.index_value_id ?? null,
      metadata: entry.metadata ? serializeJson(entry.metadata) : null
    });
    return this.getById(result.lastInsertRowid);
  }

  update(id, updates) {
    const stmt = this.db.prepare(`
      UPDATE index_constituent_weights
      SET weight_set_id = COALESCE(@weight_set_id, weight_set_id),
          index_value_id = COALESCE(@index_value_id, index_value_id),
          provider_id = COALESCE(@provider_id, provider_id),
          weight = COALESCE(@weight, weight),
          metadata = COALESCE(@metadata, metadata),
          updated_at = datetime('now')
      WHERE id = @id
    `);

    stmt.run({
      id,
      weight_set_id: updates.weight_set_id ?? null,
      index_value_id: updates.index_value_id ?? null,
      provider_id: updates.provider_id ?? null,
      weight: updates.weight ?? null,
      metadata: updates.metadata ? serializeJson(updates.metadata) : null
    });

    return this.getById(id);
  }

  getById(id) {
    const row = this.db.prepare('SELECT * FROM index_constituent_weights WHERE id = ?').get(id);
    return row ? this.#map(row) : undefined;
  }

  listForIndexValue(indexValueId) {
    return this.db
      .prepare(
        'SELECT * FROM index_constituent_weights WHERE index_value_id = ? ORDER BY weight DESC, provider_id ASC'
      )
      .all(indexValueId)
      .map((row) => this.#map(row));
  }

  listForWeightSet(weightSetId) {
    return this.db
      .prepare(
        'SELECT * FROM index_constituent_weights WHERE weight_set_id = ? ORDER BY weight DESC, provider_id ASC'
      )
      .all(weightSetId)
      .map((row) => this.#map(row));
  }

  #map(row) {
    return {
      ...row,
      metadata: parseJson(row.metadata, {})
    };
  }
}

export class IndexWeightSetRepository {
  constructor(db) {
    this.db = db;
  }

  create(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO index_weight_sets (effective_date, lookback_window_days, cap, base_divisor, divisor_version, metadata)
      VALUES (@effective_date, @lookback_window_days, @cap, @base_divisor, @divisor_version, @metadata)
    `);
    const result = stmt.run({
      ...entry,
      metadata: entry.metadata ? serializeJson(entry.metadata) : null
    });
    return this.getById(result.lastInsertRowid);
  }

  update(id, updates) {
    const stmt = this.db.prepare(`
      UPDATE index_weight_sets
      SET effective_date = COALESCE(@effective_date, effective_date),
          lookback_window_days = COALESCE(@lookback_window_days, lookback_window_days),
          cap = COALESCE(@cap, cap),
          base_divisor = COALESCE(@base_divisor, base_divisor),
          divisor_version = COALESCE(@divisor_version, divisor_version),
          metadata = COALESCE(@metadata, metadata),
          updated_at = datetime('now')
      WHERE id = @id
    `);

    stmt.run({
      id,
      effective_date: updates.effective_date ?? null,
      lookback_window_days: updates.lookback_window_days ?? null,
      cap: updates.cap ?? null,
      base_divisor: updates.base_divisor ?? null,
      divisor_version: updates.divisor_version ?? null,
      metadata: updates.metadata ? serializeJson(updates.metadata) : null
    });

    return this.getById(id);
  }

  getById(id) {
    const row = this.db.prepare('SELECT * FROM index_weight_sets WHERE id = ?').get(id);
    return row ? this.#map(row) : undefined;
  }

  findLatest() {
    const row = this.db.prepare('SELECT * FROM index_weight_sets ORDER BY effective_date DESC, created_at DESC LIMIT 1').get();
    return row ? this.#map(row) : undefined;
  }

  listRecent(limit = 12) {
    return this.db
      .prepare('SELECT * FROM index_weight_sets ORDER BY effective_date DESC, created_at DESC LIMIT ?')
      .all(limit)
      .map((row) => this.#map(row));
  }

  #map(row) {
    return {
      ...row,
      metadata: parseJson(row.metadata, {})
    };
  }
}

export class IndexConstituentExclusionRepository {
  constructor(db) {
    this.db = db;
  }

  create(entry) {
    const stmt = this.db.prepare(`
      INSERT INTO index_constituent_exclusions (weight_set_id, provider_id, reason, metadata)
      VALUES (@weight_set_id, @provider_id, @reason, @metadata)
    `);
    const result = stmt.run({
      ...entry,
      metadata: entry.metadata ? serializeJson(entry.metadata) : null
    });
    return this.getById(result.lastInsertRowid);
  }

  listForWeightSet(weightSetId) {
    return this.db
      .prepare(
        'SELECT * FROM index_constituent_exclusions WHERE weight_set_id = ? ORDER BY provider_id ASC'
      )
      .all(weightSetId)
      .map((row) => ({
        ...row,
        metadata: parseJson(row.metadata, {})
      }));
  }

  getById(id) {
    const row = this.db.prepare('SELECT * FROM index_constituent_exclusions WHERE id = ?').get(id);
    return row
      ? {
          ...row,
          metadata: parseJson(row.metadata, {})
        }
      : undefined;
  }
}
