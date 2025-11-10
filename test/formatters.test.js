import { describe, expect, it } from 'vitest';
import { formatTokenAmount, parseTokenAmount, shortenAddress } from '../src/utils/formatters.js';

describe('formatters', () => {
  it('shortens addresses', () => {
    expect(shortenAddress('0x000000000000000000000000000000000000dEaD')).toBe('0x0000…dEaD');
  });

  it('parses decimal token amounts', () => {
    const value = parseTokenAmount('1.5', 18);
    expect(value).toBe(1500000000000000000n);
  });

  it('formats bigint values', () => {
    const formatted = formatTokenAmount(1500000000000000000n, 18, 4);
    expect(formatted).toBe('1.5');
  });
});
