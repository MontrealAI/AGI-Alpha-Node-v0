import { describe, it, expect, vi } from 'vitest';
import { applyAlphaWorkUnitMetricsToTelemetry } from '../src/telemetry/alphaMetrics.js';

function createGauge() {
  const gauge = {
    records: [],
    reset: vi.fn(function reset() {
      this.records.length = 0;
    }),
    set: vi.fn(function set(labels, value) {
      this.records.push({ labels, value });
    })
  };
  return gauge;
}

function buildTelemetryHarness() {
  return {
    alphaAcceptanceGauge: createGauge(),
    alphaOnTimeGauge: createGauge(),
    alphaYieldGauge: createGauge(),
    alphaQualityGauge: createGauge(),
    alphaBreakdownGauge: createGauge()
  };
}

describe('applyAlphaWorkUnitMetricsToTelemetry', () => {
  it('resets gauges and applies overall + window metrics', () => {
    const telemetry = buildTelemetryHarness();
    const metrics = {
      overall: {
        window: 'all',
        totals: { minted: 4, accepted: 3 },
        acceptanceRate: 0.75,
        onTimeP95Seconds: 120,
        slashingAdjustedYield: 0.55,
        quality: {
          global: 0.88,
          perAgent: { 'agent.one': 0.77 },
          perNode: { 'node.one': 0.8 },
          perValidator: { 'validator.one': 0.9 }
        },
        breakdowns: {
          agents: {
            'agent.one': {
              minted: 4,
              accepted: 3,
              acceptanceRate: 0.75,
              onTimeP95Seconds: 120,
              slashes: 0,
              stake: 200,
              slashingAdjustedYield: 0.55
            }
          },
          nodes: {
            'node.one': {
              minted: 4,
              accepted: 3,
              acceptanceRate: 0.75,
              onTimeP95Seconds: 120,
              slashes: 0,
              stake: 200,
              slashingAdjustedYield: 0.55
            }
          },
          validators: {
            'validator.one': {
              minted: 4,
              accepted: 3,
              acceptanceRate: 0.75,
              onTimeP95Seconds: 120,
              validations: 4,
              slashes: 0,
              stake: 200,
              slashingAdjustedYield: 0.55
            }
          }
        }
      },
      windows: [
        {
          window: '7d',
          totals: { minted: 2, accepted: 2 },
          acceptanceRate: 1,
          onTimeP95Seconds: 90,
          slashingAdjustedYield: 0.6,
          quality: {
            global: 0.93,
            perAgent: { 'agent.one': 0.91 }
          },
          breakdowns: {
            agents: {
              'agent.one': {
                minted: 2,
                accepted: 2,
                acceptanceRate: 1,
                onTimeP95Seconds: 90,
                slashes: 0,
                stake: 120,
                slashingAdjustedYield: 0.6
              }
            }
          }
        }
      ]
    };

    applyAlphaWorkUnitMetricsToTelemetry(telemetry, metrics);

    expect(telemetry.alphaAcceptanceGauge.reset).toHaveBeenCalledTimes(1);
    expect(telemetry.alphaOnTimeGauge.reset).toHaveBeenCalledTimes(1);
    expect(telemetry.alphaYieldGauge.reset).toHaveBeenCalledTimes(1);
    expect(telemetry.alphaQualityGauge.reset).toHaveBeenCalledTimes(1);
    expect(telemetry.alphaBreakdownGauge.reset).toHaveBeenCalledTimes(1);

    expect(telemetry.alphaAcceptanceGauge.set).toHaveBeenCalledWith({ window: 'all' }, 0.75);
    expect(telemetry.alphaAcceptanceGauge.set).toHaveBeenCalledWith({ window: '7d' }, 1);
    expect(telemetry.alphaYieldGauge.set).toHaveBeenCalledWith({ window: 'all' }, 0.55);
    expect(telemetry.alphaYieldGauge.set).toHaveBeenCalledWith({ window: '7d' }, 0.6);

    expect(telemetry.alphaQualityGauge.set).toHaveBeenCalledWith(
      { window: 'all', dimension: 'global', key: 'overall' },
      0.88
    );
    expect(telemetry.alphaQualityGauge.set).toHaveBeenCalledWith(
      { window: 'all', dimension: 'agent', key: 'agent.one' },
      0.77
    );
    expect(telemetry.alphaQualityGauge.set).toHaveBeenCalledWith(
      { window: '7d', dimension: 'agent', key: 'agent.one' },
      0.91
    );

    expect(telemetry.alphaBreakdownGauge.set).toHaveBeenCalledWith(
      { window: 'all', dimension: 'agent', metric: 'minted', key: 'agent.one' },
      4
    );
    expect(telemetry.alphaBreakdownGauge.set).toHaveBeenCalledWith(
      { window: 'all', dimension: 'agent', metric: 'slashingAdjustedYield', key: 'agent.one' },
      0.55
    );
    expect(telemetry.alphaBreakdownGauge.set).toHaveBeenCalledWith(
      { window: '7d', dimension: 'agent', metric: 'acceptanceRate', key: 'agent.one' },
      1
    );
  });

  it('gracefully handles missing telemetry surfaces', () => {
    expect(() => applyAlphaWorkUnitMetricsToTelemetry(null, {})).not.toThrow();
    const telemetry = { alphaAcceptanceGauge: null };
    expect(() => applyAlphaWorkUnitMetricsToTelemetry(telemetry, null)).not.toThrow();
  });
});
