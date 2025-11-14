import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import draft7MetaSchema from 'ajv/dist/refs/json-schema-draft-07.json' assert { type: 'json' };
import { validateAlphaWu } from '../src/types/alphaWu.js';

const schemaPath = new URL('../spec/alpha_wu.schema.json', import.meta.url);
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

function buildSampleAlphaWu() {
  return {
    job_id: '0x' + 'ab'.repeat(32),
    wu_id: 'wu-1234',
    role: 'executor',
    alpha_wu_weight: 42.5,
    model_runtime: {
      name: 'LLM-70B',
      version: '1.2.0',
      runtime_type: 'container'
    },
    inputs_hash: '0x' + '11'.repeat(32),
    outputs_hash: '0x' + '22'.repeat(32),
    wall_clock_ms: 12345,
    cpu_sec: 12.345,
    gpu_sec: 512.5,
    energy_kwh: 1.234,
    node_ens_name: 'node.alpha.eth',
    attestor_address: '0x0000000000000000000000000000000000000001',
    attestor_sig: '0x' + 'aa'.repeat(65),
    created_at: new Date('2024-01-01T00:00:00Z').toISOString()
  };
}

describe('alpha-wu schema validation', () => {
  it('validates sample payload with JSON schema and zod schema', () => {
    const sample = buildSampleAlphaWu();
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    if (!ajv.getSchema('http://json-schema.org/draft-07/schema')) {
      ajv.addMetaSchema(draft7MetaSchema);
    }
    ajv.addFormat('date-time', {
      type: 'string',
      validate: (value) => Number.isFinite(Date.parse(value))
    });
    const validate = ajv.compile(schema);
    const ajvValid = validate(sample);
    if (!ajvValid) {
      console.error(validate.errors);
    }
    expect(ajvValid).toBe(true);

    const parsed = validateAlphaWu(sample);
    expect(parsed).toEqual(sample);

    const roundTrip = JSON.parse(JSON.stringify(parsed));
    expect(validateAlphaWu(roundTrip)).toEqual(parsed);
  });
});
