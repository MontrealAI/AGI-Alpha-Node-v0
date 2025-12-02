import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAddress } from 'ethers';
import { renderSubgraphManifest } from '../scripts/render-subgraph-manifest.mjs';

describe('render-subgraph-manifest script', () => {
  it('renders manifest with injected address and start block', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'manifest-test-'));
    const templatePath = join(tempDir, 'subgraph.yaml');
    const outputPath = join(tempDir, 'subgraph.ci.yaml');
    const template = [
      'source:',
      '  address: {{ alphaNodeManagerAddress }}',
      '  startBlock: {{alphaNodeManagerStartBlock}}',
      ''
    ].join('\n');
    writeFileSync(templatePath, template, 'utf8');

    const checksummed = getAddress('0x00000000000000000000000000000000000000ab');

    const result = renderSubgraphManifest({
      templatePath,
      outputPath,
      address: '0x00000000000000000000000000000000000000ab',
      startBlock: '1234567'
    });

    expect(result.address).toBe(checksummed);
    expect(result.startBlock).toBe('1234567');
    const rendered = readFileSync(outputPath, 'utf8');
    expect(rendered).toContain(`address: ${checksummed}`);
    expect(rendered).toContain('startBlock: 1234567');
  });
});
