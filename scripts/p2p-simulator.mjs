#!/usr/bin/env node
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Command } from 'commander';

class TopicBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
  }

  broadcast(topic, payload) {
    this.emit(topic, payload);
  }
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(idx, 0)];
}

class SimNode {
  constructor({ id, bus, topics, latencyMs, lossProbability, messageSizeBytes }) {
    this.id = id;
    this.bus = bus;
    this.topics = topics;
    this.latencyMs = latencyMs;
    this.lossProbability = lossProbability;
    this.messageSizeBytes = messageSizeBytes;
    this.handlers = [];
    this.received = 0;
    this.dropped = 0;
  }

  start(onMessage) {
    for (const topic of this.topics) {
      const handler = (payload) => {
        const now = performance.now();
        const jitter = Math.random() * this.latencyMs * 0.25;
        const deliveryDelay = this.latencyMs + jitter;
        if (Math.random() < this.lossProbability) {
          this.dropped += 1;
          return;
        }
        setTimeout(() => {
          this.received += 1;
          onMessage({
            topic,
            payload,
            receivedAt: performance.now(),
            publishedAt: payload.publishedAt ?? now,
            sizeBytes: this.messageSizeBytes
          });
        }, deliveryDelay);
      };
      this.handlers.push({ topic, handler });
      this.bus.on(topic, handler);
    }
  }

  stop() {
    for (const { topic, handler } of this.handlers) {
      this.bus.off(topic, handler);
    }
  }

  publish(topic) {
    const publishedAt = performance.now();
    const payload = { id: randomUUID(), publishedAt };
    this.bus.broadcast(topic, payload);
  }
}

async function runSimulation({
  nodes,
  durationSeconds,
  publishRatePerNode,
  topics,
  latencyMs,
  lossProbability,
  messageSizeBytes
}) {
  const bus = new TopicBus();
  const metrics = { latencies: [], publishes: 0, envelopes: 0, received: 0, dropped: 0 };
  const simNodes = Array.from({ length: nodes }, (_, index) =>
    new SimNode({
      id: `sim-${index}`,
      bus,
      topics,
      latencyMs,
      lossProbability,
      messageSizeBytes
    })
  );

  for (const node of simNodes) {
    node.start(({ publishedAt, receivedAt }) => {
      metrics.latencies.push(receivedAt - publishedAt);
      metrics.received += 1;
    });
  }

  const stopAt = performance.now() + durationSeconds * 1000;
  while (performance.now() < stopAt) {
    for (const node of simNodes) {
      for (const topic of topics) {
        if (Math.random() < publishRatePerNode) {
          metrics.publishes += 1;
          metrics.envelopes += simNodes.length;
          node.publish(topic);
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  simNodes.forEach((node) => {
    node.stop();
    metrics.dropped += node.dropped;
  });

  const lossRate = metrics.envelopes > 0 ? metrics.dropped / metrics.envelopes : 0;
  const fanoutMultiplier = metrics.publishes > 0 ? metrics.envelopes / metrics.publishes : 0;
  const summary = {
    nodes,
    topics,
    durationSeconds,
    publishRatePerNode,
    latencyMs,
    lossProbability,
    lossRate,
    fanoutMultiplier,
    p50: percentile(metrics.latencies, 50),
    p95: percentile(metrics.latencies, 95),
    p99: percentile(metrics.latencies, 99),
    publishes: metrics.publishes,
    envelopes: metrics.envelopes,
    received: metrics.received,
    dropped: metrics.dropped,
    memoryMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2)),
    cpuUserMs: process.resourceUsage().userCPUTime
  };

  return summary;
}

async function main() {
  const program = new Command();
  program
    .option('--nodes <n>', 'Number of simulated nodes', '1000')
    .option('--duration <seconds>', 'Duration in seconds', '5')
    .option('--rate <probability>', 'Per-node publish probability per tick (0-1)', '0.02')
    .option('--latency <ms>', 'Baseline latency in milliseconds', '75')
    .option('--loss <probability>', 'Message loss probability 0-1', '0.01')
    .option('--topics <list>', 'Comma-separated topic list', 'agi.jobs,agi.control')
    .option('--message-size <bytes>', 'Synthetic payload size (bytes)', '512');

  program.parse(process.argv);
  const options = program.opts();

  const summary = await runSimulation({
    nodes: Number.parseInt(options.nodes, 10),
    durationSeconds: Number.parseInt(options.duration, 10),
    publishRatePerNode: Number.parseFloat(options.rate),
    latencyMs: Number.parseFloat(options.latency),
    lossProbability: Number.parseFloat(options.loss),
    topics: options.topics.split(',').map((t) => t.trim()).filter(Boolean),
    messageSizeBytes: Number.parseInt(options['message-size'], 10)
  });

  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
