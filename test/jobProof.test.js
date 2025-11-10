import { describe, expect, it } from 'vitest';
import { Interface, keccak256, solidityPacked, toUtf8Bytes, zeroPadValue, hexlify } from 'ethers';
import {
  JOB_REGISTRY_ABI,
  buildProofSubmissionTx,
  createJobProof
} from '../src/services/jobProof.js';

const jobRegistryInterface = new Interface(JOB_REGISTRY_ABI);

describe('job proof attestation', () => {
  it('creates deterministic commitments from inputs', () => {
    const jobId = 'climate-sim-42';
    const result = JSON.stringify({ status: 'complete', accuracy: 0.9821 });
    const operator = '0x0000000000000000000000000000000000000fee';
    const timestamp = 1_720_000_000;
    const metadata = { pow: 'sha256', cycles: 2048 };

    const proof = createJobProof({ jobId, result, operator, timestamp, metadata });

    const expectedJobId = zeroPadValue(keccak256(toUtf8Bytes(jobId)), 32);
    const expectedMetadata = hexlify(toUtf8Bytes(JSON.stringify(metadata)));
    const expectedResultHash = keccak256(toUtf8Bytes(result));
    const expectedCommitment = keccak256(
      solidityPacked(
        ['bytes32', 'address', 'uint256', 'bytes32', 'bytes'],
        [expectedJobId, operator, BigInt(timestamp), expectedResultHash, expectedMetadata]
      )
    );

    expect(proof.jobId).toBe(expectedJobId);
    expect(proof.metadata).toBe(expectedMetadata);
    expect(proof.resultHash).toBe(expectedResultHash);
    expect(proof.commitment).toBe(expectedCommitment);
  });

  it('builds submitProof transaction payloads', () => {
    const registry = '0x0000000000000000000000000000000000000aaa';
    const proof = createJobProof({
      jobId: 'market-dive-7',
      result: 'alpha yield=42.3%',
      operator: '0x0000000000000000000000000000000000000bee',
      timestamp: '1720000100',
      metadata: 'epoch:77'
    });

    const tx = buildProofSubmissionTx({
      jobRegistryAddress: registry,
      jobId: proof.jobId,
      commitment: proof.commitment,
      resultHash: proof.resultHash,
      metadata: proof.metadata,
      resultUri: 'ipfs://alpha/market-dive-7'
    });

    expect(tx.to).toBe('0x0000000000000000000000000000000000000aaa');
    const decoded = jobRegistryInterface.decodeFunctionData('submitProof', tx.data);
    expect(decoded[0]).toBe(proof.jobId);
    expect(decoded[1]).toBe(proof.commitment);
    expect(decoded[2]).toBe(proof.resultHash);
    expect(decoded[3]).toBe('ipfs://alpha/market-dive-7');
    expect(decoded[4]).toBe(proof.metadata);
  });

  it('throws when commitment inputs are incomplete', () => {
    expect(() =>
      buildProofSubmissionTx({
        jobRegistryAddress: '0x0000000000000000000000000000000000000ccc',
        jobId: '0x1234',
        commitment: 'not-hex',
        resultHash: '0x01'
      })
    ).toThrow();
  });
});
