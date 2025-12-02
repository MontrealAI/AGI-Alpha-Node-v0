const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function shortenAddress(address) {
  if (!address || !ADDRESS_REGEX.test(address)) return address ?? '0x0';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatTokenAmount(value, decimals = 18, precision = 6) {
  if (typeof value !== 'bigint') {
    throw new TypeError('formatTokenAmount expects a bigint value');
  }
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const integer = absolute / scale;
  const fraction = absolute % scale;
  if (fraction === 0n) {
    return `${sign}${integer.toString()}`;
  }
  const fractionStr = fraction
    .toString()
    .padStart(decimals, '0')
    .slice(0, precision)
    .replace(/0+$/, '') || '0';
  return `${sign}${integer.toString()}.${fractionStr}`;
}

export function parseTokenAmount(value, decimals = 18) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    return parseTokenAmount(value.toString(), decimals);
  }
  if (typeof value !== 'string') {
    throw new TypeError('Unsupported token amount type');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new TypeError('Token amount string cannot be empty');
  }
  const sign = trimmed.startsWith('-') ? -1n : 1n;
  const numericPortion = trimmed.replace(/^[+-]/, '');
  if (!/^\d+(?:\.\d+)?$/.test(numericPortion)) {
    throw new TypeError('Invalid token amount format');
  }
  const [integerPart, fractionalPart = ''] = numericPortion.split('.');
  const normalizedFraction = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
  const scale = 10n ** BigInt(decimals);
  const integer = BigInt(integerPart || '0') * scale;
  const fraction = BigInt(normalizedFraction || '0');
  const magnitude = integer + fraction;
  return sign === -1n ? -magnitude : magnitude;
}
