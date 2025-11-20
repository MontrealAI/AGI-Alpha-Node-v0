import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createExecutionLogger } from '../../src/treasury/executionLogger.js';

const digest = '0x1234abcd00000000000000000000000000000000000000000000000000000000';

describe('ExecutionLogger', () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'execution-logger-'));
    logPath = join(tempDir, 'exec.log');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes structured lifecycle events to the log file', () => {
    const logger = createExecutionLogger({ logPath, sync: true, baseFields: { treasury: '0xabc' } });

    logger.intentReceived({ intentDigest: digest });
    logger.signaturesLoaded(2, { intentDigest: digest });
    logger.thresholdSatisfied(2, ['g1', 'g2'], { intentDigest: digest });
    logger.broadcast('0xfeed', { intentDigest: digest });
    logger.executed('0xfeed', { intentDigest: digest });

    const content = readFileSync(logPath, 'utf8');
    expect(content).toContain('intent_received');
    expect(content).toContain('threshold_met');
    expect(content).toContain('0xfeed');
    expect(content).toContain('"treasury":"0xabc"');
  });

  it('records threshold shortfalls and failures', () => {
    const logger = createExecutionLogger({ logPath, sync: true });
    logger.thresholdShortfall(3, 1, ['g1', 'g2'], { intentDigest: digest });
    logger.failure(new Error('boom'), { intentDigest: digest });

    const content = readFileSync(logPath, 'utf8');
    expect(content).toContain('threshold_shortfall');
    expect(content).toContain('failure');
    expect(content).toContain('boom');
  });
});
