import { describe, expect, it } from 'vitest';
import {
  getNodeEnsName,
  getNodePayoutAddresses,
  buildEnsRecordTemplate
} from '../src/ens/ens_config.js';

describe('ENS config helpers', () => {
  it('returns configured ENS name with trimming', () => {
    const name = getNodeEnsName({ config: { NODE_ENS_NAME: ' Node.AGI.eth ' } });
    expect(name).toBe('node.agi.eth');
  });

  it('derives ENS name from label and parent when explicit value missing', () => {
    const name = getNodeEnsName({ config: { NODE_LABEL: '2', ENS_PARENT_DOMAIN: 'alpha.node.agi.eth' } });
    expect(name).toBe('2.alpha.node.agi.eth');
  });

  it('builds payout addresses with fallbacks', () => {
    const payouts = getNodePayoutAddresses({
      config: {
        NODE_PAYOUT_ETH_ADDRESS: '0x0000000000000000000000000000000000000001',
        OPERATOR_ADDRESS: '0x0000000000000000000000000000000000000002'
      }
    });
    expect(payouts.eth).toBe('0x0000000000000000000000000000000000000001');
    expect(payouts.agialpha).toBe('0x0000000000000000000000000000000000000001');
  });

  it('emits deterministic ENS record templates', () => {
    const template = buildEnsRecordTemplate({
      config: {
        NODE_ENS_NAME: 'node.alpha.eth',
        NODE_PAYOUT_ETH_ADDRESS: '0x0000000000000000000000000000000000000001',
        NODE_PAYOUT_AGIALPHA_ADDRESS: '0x0000000000000000000000000000000000000002',
        VERIFIER_PUBLIC_BASE_URL: 'https://verifier.alpha',
        NODE_PRIMARY_MODEL: 'hypernet:v1'
      },
      commitHash: '0xcommit'
    });
    expect(template.ens_name).toBe('node.alpha.eth');
    expect(template.text_records.agialpha_verifier).toBe('https://verifier.alpha');
    expect(template.text_records.agialpha_health).toBe('https://verifier.alpha/verifier/health');
    expect(template.text_records.agialpha_model).toBe('hypernet:v1');
    expect(template.text_records.agialpha_commit).toBe('0xcommit');
    expect(template.coin_addresses.ETH).toBe('0x0000000000000000000000000000000000000001');
    expect(template.coin_addresses.AGIALPHA).toBe('0x0000000000000000000000000000000000000002');
  });

  it('normalizes trailing slash and resolves health URL from base URL', () => {
    const template = buildEnsRecordTemplate({
      config: {
        NODE_ENS_NAME: 'validator.alpha.eth',
        NODE_PAYOUT_ETH_ADDRESS: '0x0000000000000000000000000000000000000003',
        VERIFIER_PUBLIC_BASE_URL: 'https://validator.alpha/',
        NODE_PRIMARY_MODEL: 'validator:v1'
      },
      commitHash: '0xfeedface'
    });

    expect(template.text_records.agialpha_verifier).toBe('https://validator.alpha');
    expect(template.text_records.agialpha_health).toBe('https://validator.alpha/verifier/health');
  });
});
