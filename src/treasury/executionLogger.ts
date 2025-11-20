import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pino, { multistream, type LoggerOptions, type DestinationStream } from 'pino';
import type { TreasuryIntentV1, HexData } from './intentTypes.js';

export interface ExecutionLoggerOptions {
  logPath?: string;
  sync?: boolean;
  baseFields?: Record<string, unknown>;
}

export interface ExecutionLogContext {
  intentDigest: HexData;
  intent?: TreasuryIntentV1;
  [key: string]: unknown;
}

export class ExecutionLogger {
  readonly logPath?: string;
  readonly logger: pino.Logger;

  constructor(options: ExecutionLoggerOptions = {}) {
    const { logPath, sync = false, baseFields = {} } = options;
    const streams: DestinationStream[] = [{ stream: process.stdout }];

    if (logPath) {
      const target = resolve(logPath);
      mkdirSync(dirname(target), { recursive: true });
      streams.push(pino.destination({ dest: target, sync }));
      this.logPath = target;
    }

    const config: LoggerOptions = { level: 'info', base: baseFields };
    this.logger = streams.length > 1 ? pino(config, multistream(streams)) : pino(config, streams[0]);
  }

  intentReceived(context: ExecutionLogContext) {
    this.logger.info({ event: 'intent_received', ...context }, 'Intent received');
  }

  signaturesLoaded(count: number, context: ExecutionLogContext) {
    this.logger.info({ event: 'signatures_loaded', count, ...context }, 'Signatures loaded');
  }

  thresholdSatisfied(threshold: number, guardians: string[], context: ExecutionLogContext) {
    this.logger.info(
      { event: 'threshold_met', threshold, guardians, ...context },
      'Threshold satisfied; preparing execution'
    );
  }

  thresholdShortfall(threshold: number, approvals: number, pending: string[], context: ExecutionLogContext) {
    this.logger.warn(
      { event: 'threshold_shortfall', threshold, approvals, pending, ...context },
      'Threshold not met'
    );
  }

  broadcast(txHash: string, context: ExecutionLogContext) {
    this.logger.info({ event: 'broadcast', txHash, ...context }, 'Transaction broadcasted');
  }

  executed(txHash: string, context: ExecutionLogContext) {
    this.logger.info({ event: 'executed', txHash, ...context }, 'Intent executed on-chain');
  }

  failure(reason: unknown, context: ExecutionLogContext) {
    const payload =
      reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason ?? 'Unknown error';
    this.logger.error({ event: 'failure', reason: payload, ...context }, 'Execution failed');
  }
}

export function createExecutionLogger(options: ExecutionLoggerOptions = {}) {
  return new ExecutionLogger(options);
}
