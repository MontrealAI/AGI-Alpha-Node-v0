import { describe, expect, it, vi } from 'vitest';
import type { InspectResult } from '../scripts/ens-inspect.ts';

function buildFixture(): InspectResult {
  return {
    name: 'alpha.agent.agi.eth',
    network: {
      chainId: 1,
      rpcUrl: 'https://rpc.local',
      ensRegistry: '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e',
      nameWrapper: '0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401',
      publicResolver: '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63'
    },
    resolver: '0x000000000000000000000000000000000000dead',
    pubkey: { x: '0x01', y: '0x02' },
    contenthash: 'ipfs://alpha',
    textRecords: {
      'node.role': 'orchestrator',
      'node.version': '1.2.3',
      'node.dnsaddr': null
    },
    nameWrapper: {
      owner: '0x000000000000000000000000000000000000cafe',
      fuses: 7,
      expiry: 1_700_000_000,
      expiryISO: '2023-11-14T22:13:20.000Z'
    }
  };
}

describe('ens:inspect CLI', () => {
  it('accepts ENS name via positional argument and forwards options', async () => {
    const inspectMock = vi.fn().mockResolvedValue(buildFixture());
    const printerMock = vi.fn();
    const { createProgram } = await import('../scripts/ens-inspect.ts');

    const program = createProgram({ inspect: inspectMock, printer: printerMock, exitOverride: true });

    await program.parseAsync(['node', 'ens-inspect', 'beta.agent.agi.eth', '--chain-id', '11155111'], {
      from: 'node'
    });

    expect(inspectMock).toHaveBeenCalledWith('beta.agent.agi.eth', expect.objectContaining({ chainId: '11155111' }));
    expect(printerMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'alpha.agent.agi.eth' }));
  });

  it('accepts ENS name via --ens flag for ergonomics', async () => {
    const inspectMock = vi.fn().mockResolvedValue(buildFixture());
    const printerMock = vi.fn();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { createProgram } = await import('../scripts/ens-inspect.ts');

    const program = createProgram({ inspect: inspectMock, printer: printerMock, exitOverride: true });

    await program.parseAsync(['node', 'ens-inspect', '--ens', 'gamma.agent.agi.eth', '--json'], { from: 'node' });

    expect(inspectMock).toHaveBeenCalledWith('gamma.agent.agi.eth', expect.objectContaining({ json: true }));
    expect(printerMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"name": "alpha.agent.agi.eth"'));

    logSpy.mockRestore();
  });

  it('surfaces helpful error when no ENS name provided', async () => {
    const { createProgram } = await import('../scripts/ens-inspect.ts');
    const program = createProgram({ inspect: vi.fn(), printer: vi.fn(), exitOverride: true });

    await expect(program.parseAsync(['node', 'ens-inspect'], { from: 'node' })).rejects.toThrow(
      /ENS name is required via positional argument or --ens <name>/
    );
  });
});
