import { describe, expect, it } from 'vitest';
import { Interface } from 'ethers';
import {
  buildApplyForJobTx,
  buildCompleteJobTx,
  buildReleasePaymentTx,
  buildAcknowledgeWorkTx,
  buildRecordHeartbeatTx,
  decodeJobStatus,
  encodeGetJobCall
} from '../src/services/jobs.js';

const REGISTRY = '0x000000000000000000000000000000000000dEaD';

describe('jobs service', () => {
  it('builds applyForJob payload', () => {
    const tx = buildApplyForJobTx({ jobRegistryAddress: REGISTRY, jobId: 42n, metadata: 'profile:v0' });
    expect(tx.to).toBe(REGISTRY);
    expect(tx.jobId).toBe(42n);
    expect(tx.metadata.startsWith('0x')).toBe(true);
    expect(tx.data.startsWith('0x')).toBe(true);
  });

  it('builds completeJob payload from result data', () => {
    const tx = buildCompleteJobTx({
      jobRegistryAddress: REGISTRY,
      jobId: 99,
      resultData: 'alpha-result',
      resultURI: 'ipfs://alpha'
    });
    expect(tx.jobId).toBe(99n);
    expect(tx.resultURI).toBe('ipfs://alpha');
    expect(tx.resultHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('builds releasePayment payload', () => {
    const tx = buildReleasePaymentTx({ jobRegistryAddress: REGISTRY, jobId: 7 });
    expect(tx.jobId).toBe(7n);
    expect(tx.to).toBe(REGISTRY);
    expect(tx.data.startsWith('0x')).toBe(true);
  });

  it('builds acknowledgeWork payload with padding', () => {
    const tx = buildAcknowledgeWorkTx({ jobRegistryAddress: REGISTRY, jobId: 123, workHash: '0x12' });
    expect(tx.jobId).toBe(123n);
    expect(tx.workHash.length).toBe(66);
  });

  it('builds recordHeartbeat payload', () => {
    const tx = buildRecordHeartbeatTx({ jobRegistryAddress: REGISTRY, jobId: 55 });
    expect(tx.jobId).toBe(55n);
    expect(tx.to).toBe(REGISTRY);
  });

  it('decodes job status response', () => {
    const iface = new Interface([
      'function getJob(uint256 jobId) view returns (tuple(uint8 status, address worker, uint256 expiresAt))'
    ]);
    const encoded = iface.encodeFunctionResult('getJob', [[1, '0x1111111111111111111111111111111111111111', 66n]]);
    const status = decodeJobStatus({ data: encoded });
    expect(status.status).toBe(1);
    expect(status.worker).toBe('0x1111111111111111111111111111111111111111');
    expect(status.expiresAt).toBe(66n);
  });

  it('encodes getJob call data', () => {
    const data = encodeGetJobCall({ jobId: 5 });
    expect(data.startsWith('0x')).toBe(true);
    expect(data.length).toBeGreaterThan(10);
  });
});
