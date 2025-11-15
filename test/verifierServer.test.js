import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Wallet } from 'ethers';
import { startVerifierServer } from '../src/network/verifierServer.js';
import { signAlphaWu } from '../src/crypto/signing.js';

const attestorKey = '0x59c6995e998f97a5a0044966f0945386f0b0c9cc1fa50bdbeeb29f44cbeb2c82';
const validatorKey = '0x8b3a350cf5c34c9194ca5b9ce735ffdac58fb5cae5be7c3f5e8c4b9f2e888d8f';

function buildUnsignedAlphaWu() {
  return {
    job_id: 'job-verifier-1',
    wu_id: 'job-verifier-1:segment-0',
    role: 'executor',
    alpha_wu_weight: 5,
    model_runtime: {
      name: 'LLM-8B',
      version: '1.0.0',
      runtime_type: 'container'
    },
    inputs_hash: '0x' + 'aa'.repeat(32),
    outputs_hash: '0x' + 'bb'.repeat(32),
    wall_clock_ms: 3200,
    cpu_sec: 150,
    gpu_sec: 45,
    energy_kwh: 1.5,
    node_ens_name: 'verifier.alpha.eth',
    attestor_address: '0x0000000000000000000000000000000000000000',
    attestor_sig: '0x',
    created_at: new Date('2024-07-01T00:00:00Z').toISOString()
  };
}

describe('verifier server', () => {
  const validatorWallet = new Wallet(validatorKey);
  const attestorWallet = new Wallet(attestorKey);
  const config = {
    NODE_ROLE: 'validator',
    NODE_ENS_NAME: 'verifier.alpha.eth',
    NODE_PAYOUT_ETH_ADDRESS: validatorWallet.address,
    NODE_PAYOUT_AGIALPHA_ADDRESS: validatorWallet.address,
    NODE_PRIMARY_MODEL: 'orchestrator-hypernet:v1',
    VALIDATOR_PRIVATE_KEY: validatorKey,
    OPERATOR_ADDRESS: attestorWallet.address,
    VERIFIER_PORT: 0,
    VERIFIER_PUBLIC_BASE_URL: 'https://verifier.example',
    NODE_LABEL: 'verifier',
    ENS_PARENT_DOMAIN: 'alpha.node.agi.eth'
  };

  let server;
  let baseUrl;

  beforeAll(async () => {
    server = startVerifierServer({ config, port: 0 });
    const address = await server.listenPromise;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  it('exposes verifier info and health metadata', async () => {
    const info = await fetch(`${baseUrl}/verifier/info`).then((res) => res.json());
    expect(info.node_ens_name).toBe('verifier.alpha.eth');
    expect(info.supported_roles).toContain('validator');
    expect(info.ens_records.text_records.agialpha_verifier).toBe(config.VERIFIER_PUBLIC_BASE_URL);
    expect(info.ens_records.text_records.agialpha_health).toBe(
      `${config.VERIFIER_PUBLIC_BASE_URL}/verifier/health`
    );
    expect(info.ens_records.coin_addresses.ETH).toBe(validatorWallet.address);
    expect(info.ens_records.coin_addresses.AGIALPHA).toBe(validatorWallet.address);
    expect(info.metrics.total_requests).toBeGreaterThanOrEqual(1);
    expect(info.metrics.total_validations).toBe(0);

    const health = await fetch(`${baseUrl}/verifier/health`).then((res) => res.json());
    expect(health.status).toBe('ok');
    expect(health.total_requests).toBeGreaterThanOrEqual(2);
    expect(health.total_validations).toBe(0);
  });

  it('validates α-WUs via POST /verifier/validate', async () => {
    const unsigned = buildUnsignedAlphaWu();
    const signed = await signAlphaWu(unsigned, { privateKey: attestorKey });
    const response = await fetch(`${baseUrl}/verifier/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signed)
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.is_valid).toBe(true);
    expect(payload.node_ens_name).toBe('verifier.alpha.eth');
    expect(payload.validator_address.toLowerCase()).toBe(validatorWallet.address.toLowerCase());
  });
});
