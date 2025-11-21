import { EventEmitter } from 'node:events';
import { register as defaultRegistry, type Registry } from 'prom-client';
import {
  registerDCUtRMetrics,
  type DCUtRLabelSet,
} from '../../observability/prometheus/metrics_dcutr.js';
import { wireDCUtRMetricBridge } from './dcutrEvents.js';

type HarnessOptions = {
  intervalMs?: number;
  successRate?: number;
  totalEvents?: number;
  registry?: Registry;
  rng?: () => number;
  transports?: string[];
  relays?: string[];
  regions?: string[];
  asns?: string[];
};

type HarnessControl = {
  emitter: EventEmitter;
  stop: () => void;
};

const DEFAULTS = {
  intervalMs: 250,
  successRate: 0.7,
  totalEvents: 24,
  transports: ['quic', 'tcp'],
  relays: ['relay-a', 'relay-b'],
  regions: ['iad', 'dub', 'sin'],
  asns: ['64512', '64513', '64514'],
};

function sample<T>(values: T[], rng: () => number): T {
  return values[Math.floor(rng() * values.length) % values.length];
}

function boundedRng(rng: () => number, min: number, max: number): number {
  const base = rng();
  return min + base * (max - min);
}

export function startSyntheticDCUtRGenerator(options: HarnessOptions = {}): HarnessControl {
  const {
    intervalMs = DEFAULTS.intervalMs,
    successRate = DEFAULTS.successRate,
    totalEvents = DEFAULTS.totalEvents,
    registry = defaultRegistry,
    rng = Math.random,
    transports = DEFAULTS.transports,
    relays = DEFAULTS.relays,
    regions = DEFAULTS.regions,
    asns = DEFAULTS.asns,
  } = options;

  registerDCUtRMetrics(registry);
  const emitter = new EventEmitter();
  const detach = wireDCUtRMetricBridge(emitter, registry);

  let emitted = 0;
  const timer = setInterval(() => {
    emitted += 1;
    const labels: DCUtRLabelSet = {
      transport: sample(transports, rng),
      relay_id: sample(relays, rng),
      region: sample(regions, rng),
      asn: sample(asns, rng),
    };

    emitter.emit('relayDialSuccess', { labels, relayBytes: Math.round(boundedRng(rng, 2000, 6400)) });
    emitter.emit('holePunchStart', { labels });

    const isSuccess = rng() < successRate;
    if (isSuccess) {
      const elapsedSeconds = boundedRng(rng, 0.25, 3.5);
      const rttMs = boundedRng(rng, 18, 120);
      const lossPercent = boundedRng(rng, 0, 1.8);
      const directBytes = Math.round(boundedRng(rng, 1024, 40960));
      emitter.emit('directPathConfirmed', {
        labels,
        elapsedSeconds,
        rttMs,
        lossPercent,
        directBytes,
      });
      emitter.emit('streamMigration', { labels, directBytes, rttMs, lossPercent });
    } else {
      const relayBytes = Math.round(boundedRng(rng, 4096, 32768));
      emitter.emit('relayFallbackActive', { labels, relayBytes });
      emitter.emit('streamMigration', { labels, relayBytes });
    }

    if (emitted >= totalEvents) {
      clearInterval(timer);
      detach();
    }
  }, intervalMs);

  const stop = () => {
    clearInterval(timer);
    detach();
    emitter.removeAllListeners();
  };

  return { emitter, stop };
}
