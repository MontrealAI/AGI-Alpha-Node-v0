import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

describe('cli configuration hydration', () => {
  it('hydrates configuration from a custom --config path before executing commands', () => {
    const workdir = mkdtempSync(join(tmpdir(), 'agi-cli-config-'));
    const envPath = join(workdir, '.env');
    writeFileSync(
      envPath,
      [
        'NODE_LABEL=override-node',
        'ENS_PARENT_DOMAIN=test-domain.eth',
        'NODE_ENS_NAME=override-node.test-domain.eth'
      ].join('\n'),
      'utf8'
    );

    const env = { ...process.env };
    delete env.CONFIG_PATH;
    delete env.NODE_LABEL;
    delete env.ENS_PARENT_DOMAIN;

    const result = spawnSync('node', [cliEntrypoint, '--config', envPath, 'ens:records'], {
      encoding: 'utf8',
      env
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.ens_name).toBe('override-node.test-domain.eth');
  });
});
