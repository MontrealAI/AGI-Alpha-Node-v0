import { EventEmitter } from 'node:events';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runVitest, translateArgs, vitestBin } from '../scripts/lib/vitest-runner.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}));

const spawnMock = /** @type {import('vitest').Mock} */ (await import('node:child_process')).spawn;

describe('vitest runner', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => new EventEmitter());
  });

  it('translates runInBand flag into thread pool override', () => {
    const args = translateArgs(['--runInBand', '--config', 'custom.config.js']);
    expect(args).toEqual(['--config', 'custom.config.js', '--pool=threads', '--poolOptions.threads.singleThread=true']);
  });

  it('propagates spawn failures with a helpful rejection', async () => {
    const spawnError = new Error('spawn failed');
    spawnMock.mockImplementation(() => {
      throw spawnError;
    });

    await expect(runVitest(['--runInBand'])).rejects.toThrow(spawnError);
  });

  it('resolves with exit metadata when the child exits', async () => {
    const child = new EventEmitter();
    spawnMock.mockReturnValue(child);

    const runPromise = runVitest(['--config', 'foo']);
    child.emit('exit', 0, null);

    await expect(runPromise).resolves.toEqual({ code: 0, signal: null });
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [vitestBin, '--config', 'foo'],
      expect.objectContaining({ stdio: 'inherit' })
    );
  });

  it('rejects when the child emits an error event', async () => {
    const child = new EventEmitter();
    spawnMock.mockReturnValue(child);

    const runPromise = runVitest();
    const emittedError = new Error('boom');
    child.emit('error', emittedError);

    await expect(runPromise).rejects.toThrow(emittedError);
  });
});
