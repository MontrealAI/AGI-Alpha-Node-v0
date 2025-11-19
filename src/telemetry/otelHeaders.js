export function parseOtlpHeaders(rawHeaders) {
  if (!rawHeaders || typeof rawHeaders !== 'string') {
    return undefined;
  }

  return rawHeaders
    .split(/[,;]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.includes('='))
    .reduce((acc, entry) => {
      const [key, ...rest] = entry.split('=');
      const value = rest.join('=').trim();
      if (key && value) {
        acc[key.trim()] = value;
      }
      return acc;
    }, {});
}
