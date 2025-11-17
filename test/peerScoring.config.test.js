import { describe, expect, it } from 'vitest';
import {
  buildGossipsubScoreParams,
  buildPeerScoreConfig,
  resolveTopicScoreParams
} from '../src/services/peerScoring.js';

describe('peer scoring config', () => {
  it('resolves wildcard topic score parameters with specificity preference', () => {
    const config = buildPeerScoreConfig({
      topicParams: {
        'agi.telemetry.*': { topicWeight: 2 },
        'agi.telemetry.debug': { invalidMessagePenalty: -2.5 }
      }
    });

    const telemetryParams = resolveTopicScoreParams('agi.telemetry.debug', config);
    expect(telemetryParams.topicWeight).toBe(2);
    expect(telemetryParams.invalidMessagePenalty).toBe(-2.5);

    const wildcardParams = resolveTopicScoreParams('agi.telemetry.extra', config);
    expect(wildcardParams.topicWeight).toBe(2);
    expect(wildcardParams.invalidMessagePenalty).toBe(-0.65);
  });

  it('builds GossipSub v1.1 compatible score params', () => {
    const config = buildPeerScoreConfig({
      decayIntervalMs: 1500,
      topicParams: { 'agi.jobs': { topicWeight: 1.1, expectedMessagePerSecond: 0.5 } },
      thresholds: { gossip: -1.5, publish: -3.5, graylist: -5.5, disconnect: -7.5 }
    });

    const params = buildGossipsubScoreParams(config);
    expect(params.version).toBe('1.1');
    expect(params.decayInterval).toBe(1500);
    expect(params.scoreParams.topics['agi.jobs'].topicWeight).toBe(1.1);
    expect(params.scoreThresholds.disconnect).toBe(-7.5);
    expect(params.scoreParams.topics['agi.jobs'].expectedMessagePerSecond).toBeCloseTo(0.5);
  });
});
