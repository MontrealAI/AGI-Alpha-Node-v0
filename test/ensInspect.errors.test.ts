import { describe, expect, it } from 'vitest';
import { EnsNetworkError, extractNetworkErrorCode } from '../scripts/ens-inspect.ts';

describe('ens-inspect network error helpers', () => {
  it('extracts code from direct error objects', () => {
    const error = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8545'), {
      code: 'ECONNREFUSED'
    });
    expect(extractNetworkErrorCode(error)).toBe('ECONNREFUSED');
  });

  it('walks aggregate errors to locate network codes', () => {
    const inner = Object.assign(new Error('connect ENETUNREACH'), { code: 'ENETUNREACH' });
    const aggregate = new AggregateError([inner], 'Multiple failures');
    expect(extractNetworkErrorCode(aggregate)).toBe('ENETUNREACH');
  });

  it('returns null when error is unrelated to networking', () => {
    const error = new Error('Unhandled failure');
    expect(extractNetworkErrorCode(error)).toBeNull();
  });

  it('exposes rpc url and code on EnsNetworkError', () => {
    const cause = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const wrapper = new EnsNetworkError({ rpcUrl: 'https://rpc.example', code: 'ETIMEDOUT', cause });
    expect(wrapper.rpcUrl).toBe('https://rpc.example');
    expect(wrapper.code).toBe('ETIMEDOUT');
    expect((wrapper as { cause?: unknown }).cause).toBe(cause);
  });
});
