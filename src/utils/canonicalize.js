import { isDeepStrictEqual } from 'node:util';

function canonicalize(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        const val = value[key];
        if (val === undefined) {
          return acc;
        }
        acc[key] = canonicalize(val);
        return acc;
      }, {});
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot canonicalize non-finite number');
    }
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function canonicalEquals(left, right) {
  return isDeepStrictEqual(canonicalize(left), canonicalize(right));
}

export function stripKeys(value, keysToStrip = []) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const stripped = { ...value };
  keysToStrip.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(stripped, key)) {
      delete stripped[key];
    }
  });
  return stripped;
}

export function canonicalizeForSigning(value, keysToStrip = []) {
  const sanitized = stripKeys(value, keysToStrip);
  return canonicalJson(sanitized);
}
