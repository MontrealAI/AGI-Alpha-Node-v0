import { afterEach, describe, expect, it, vi } from 'vitest';
import { installProcessGuards } from '../src/utils/processGuard.js';

const noop = () => {};

describe('process guard', () => {
  const originalExit = process.exit;

  afterEach(() => {
    process.exit = originalExit;
  });

  it('logs and exits on unhandled rejections', () => {
    const logger = { error: vi.fn(), info: noop, warn: noop };
    process.exit = vi.fn();
    const remove = installProcessGuards(logger);

    const reason = new Error('boom');
    remove.handlers.onUnhandledRejection(reason);

    expect(logger.error).toHaveBeenCalledWith(
      { err: reason, origin: 'unhandledRejection' },
      'Unhandled error encountered; shutting down'
    );
    expect(process.exit).toHaveBeenCalledWith(1);

    remove();
  });

  it('normalizes non-error reasons before logging', () => {
    const logger = { error: vi.fn(), info: noop, warn: noop };
    process.exit = vi.fn();
    const remove = installProcessGuards(logger);

    remove.handlers.onUncaughtException('fatal string');

    const [[payload]] = logger.error.mock.calls;
    expect(payload.err).toBeInstanceOf(Error);
    expect(payload.err.message).toContain('fatal string');
    expect(payload.origin).toBe('uncaughtException');
    expect(process.exit).toHaveBeenCalledWith(1);

    remove();
  });

  it('handles unserializable inputs without throwing', () => {
    const logger = { error: vi.fn(), info: noop, warn: noop };
    process.exit = vi.fn();
    const remove = installProcessGuards(logger);

    const circular = {};
    circular.self = circular;

    expect(() => remove.handlers.onUnhandledRejection(circular)).not.toThrow();

    const [[payload]] = logger.error.mock.calls;
    expect(payload.err).toBeInstanceOf(Error);
    expect(payload.err.message).toBe('Unserializable error payload');
    expect(payload.err.cause).toBe(circular);
    expect(process.exit).toHaveBeenCalledWith(1);

    remove();
  });
});
