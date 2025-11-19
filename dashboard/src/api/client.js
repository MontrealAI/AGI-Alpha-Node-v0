function buildHeaders(apiKey) {
  const headers = { Accept: 'application/json' };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function safeFetch(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export async function fetchIndexHistory(baseUrl, apiKey, { from, to, limit = 60 } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (limit) params.set('limit', String(limit));
  const url = `${baseUrl.replace(/\/$/, '')}/index/history?${params.toString()}`;
  return safeFetch(url, { headers: buildHeaders(apiKey) });
}

export async function fetchProviders(baseUrl, apiKey, { limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  const url = `${baseUrl.replace(/\/$/, '')}/providers?${params.toString()}`;
  return safeFetch(url, { headers: buildHeaders(apiKey) });
}

export async function fetchProviderScores(baseUrl, apiKey, providerId, { from, to, limit = 90 } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (limit) params.set('limit', String(limit));
  const url = `${baseUrl.replace(/\/$/, '')}/providers/${providerId}/scores?${params.toString()}`;
  return safeFetch(url, { headers: buildHeaders(apiKey) });
}

export async function fetchTelemetryRuns(baseUrl, apiKey, { from, to, providerId = null, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (providerId) params.set('provider', String(providerId));
  if (limit) params.set('limit', String(limit));
  const url = `${baseUrl.replace(/\/$/, '')}/telemetry/task-runs?${params.toString()}`;
  return safeFetch(url, { headers: buildHeaders(apiKey) });
}

export async function fetchDebugNetwork(baseUrl, apiKey, { windowMinutes = 15 } = {}) {
  const params = new URLSearchParams({ window: String(windowMinutes) });
  const url = `${baseUrl.replace(/\/$/, '')}/debug/network?${params.toString()}`;
  return safeFetch(url, { headers: buildHeaders(apiKey) });
}

export async function fetchDebugResources(baseUrl, apiKey) {
  const url = `${baseUrl.replace(/\/$/, '')}/debug/resources`;
  return safeFetch(url, { headers: buildHeaders(apiKey) });
}
