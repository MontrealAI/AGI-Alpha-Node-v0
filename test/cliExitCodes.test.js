import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cliEntrypoint = fileURLToPath(new URL('../src/index.js', import.meta.url));

describe('cli error handling', () => {
  it('returns a non-zero exit code when required options are missing', () => {
    const result = spawnSync('node', [cliEntrypoint, 'status'], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("required option '-l, --label <label>' not specified");
  });
});
