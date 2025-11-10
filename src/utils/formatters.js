const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function shortenAddress(address) {
  if (!address || !ADDRESS_REGEX.test(address)) return address ?? '0x0';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatTokenAmount(value, decimals = 18, precision = 6) {
  if (typeof value !== 'bigint') {
    throw new TypeError('formatTokenAmount expects a bigint value');
  }
  const scale = 10n ** BigInt(decimals);
  const integer = value / scale;
  const fraction = value % scale;
  if (fraction === 0n) {
    return `${integer.toString()}`;
  }
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, precision);
  return `${integer.toString()}.${fractionStr.replace(/0+$/, '')}`;
}

export function parseTokenAmount(value, decimals = 18) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    return parseTokenAmount(value.toString(), decimals);
  }
  if (typeof value !== 'string') {
    throw new TypeError('Unsupported token amount type');
  }
  const [integerPart, fractionalPart = ''] = value.split('.');
  const normalizedFraction = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
  const scale = 10n ** BigInt(decimals);
  return BigInt(integerPart || '0') * scale + BigInt(normalizedFraction || '0');
}
