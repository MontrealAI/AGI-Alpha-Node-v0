import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAddress } from 'ethers';
import { renderSubgraphManifest } from '../scripts/render-subgraph-manifest.mjs';

async function createTemplate(contents) {
  const dir = await fs.mkdtemp(join(tmpdir(), 'subgraph-manifest-'));
  const templatePath = join(dir, 'template.yaml');
  await fs.writeFile(templatePath, contents, 'utf8');
  const outputPath = join(dir, 'output.yaml');
  return { templatePath, outputPath };
}

describe('renderSubgraphManifest', () => {
  it('checksums the address and preserves numeric start block', async () => {
    const { templatePath, outputPath } = await createTemplate(
      'address: {{ alphaNodeManagerAddress }}\nstartBlock: {{ alphaNodeManagerStartBlock }}\n'
    );

    const checksumAddress = getAddress('0xa61a3b3a130a9c20768eebf97e21515a6046a1fa');

    const result = renderSubgraphManifest({
      templatePath,
      outputPath,
      address: ' 0xa61a3b3a130a9c20768eebf97e21515a6046a1fa ',
      startBlock: ' 42 '
    });

    const rendered = await fs.readFile(result.outputPath, 'utf8');
    expect(rendered).toContain(`address: ${checksumAddress}`);
    expect(rendered).toContain('startBlock: 42');
  });

  it('rejects malformed addresses early', async () => {
    const { templatePath, outputPath } = await createTemplate('noop');
    expect(() =>
      renderSubgraphManifest({ templatePath, outputPath, address: 'not-an-address' })
    ).toThrow(/Invalid AlphaNodeManager address/);
  });

  it('rejects non-integer start blocks', async () => {
    const { templatePath, outputPath } = await createTemplate('noop');
    expect(() =>
      renderSubgraphManifest({ templatePath, outputPath, startBlock: 'abc' })
    ).toThrow('ALPHA_NODE_MANAGER_START_BLOCK must be a non-negative integer');
    expect(() =>
      renderSubgraphManifest({ templatePath, outputPath, startBlock: '-1' })
    ).toThrow('ALPHA_NODE_MANAGER_START_BLOCK must be a non-negative integer');
  });
});
