import React, { useEffect, useMemo, useState } from 'react';
import { fetchProviders, fetchTelemetryRuns } from '../api/client.js';

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function defaultWindow() {
  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 6);
  return { from: toIsoDate(from), to: toIsoDate(today) };
}

export function TelemetryView({ baseUrl, apiKey, refreshNonce = 0 }) {
  const { from: defaultFrom, to: defaultTo } = useMemo(() => defaultWindow(), []);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [providerId, setProviderId] = useState('');
  const [providers, setProviders] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function loadProviders() {
    try {
      const payload = await fetchProviders(baseUrl, apiKey, { limit: 100 });
      setProviders(payload.providers ?? []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadRuns() {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchTelemetryRuns(baseUrl, apiKey, {
        from,
        to,
        providerId: providerId ? Number(providerId) : null,
        limit: 50
      });
      setRuns(payload.task_runs ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, apiKey, refreshNonce]);

  useEffect(() => {
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, providerId, baseUrl, apiKey, refreshNonce]);

  return (
    <section className="panel" aria-label="Telemetry debug">
      <h2>🛠️ Telemetry debug</h2>
      <p className="hint">Recent ingested TaskRuns with energy and quality overlays for observability drilling.</p>

      <div className="controls">
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label>
          Provider
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="">Any</option>
            {(providers ?? []).map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="button" onClick={loadRuns} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh window'}
        </button>
      </div>

      {error && <div className="badge warning">{error}</div>}

      <ul className="log-list">
        {(runs ?? []).map((run) => (
          <li key={run.id} className="log-item">
            <header>
              <strong>{run.provider?.name ?? `Provider ${run.provider_id}`}</strong>
              <span className="badge info">{run.status}</span>
            </header>
            <div className="small-text">Task type: {run.task_type?.name ?? 'n/a'}</div>
            <div className="small-text">External id: {run.external_id ?? '—'}</div>
            <div className="small-text">
              Throughput: {run.raw_throughput ?? 0} · Tokens: {run.tokens_processed ?? 0} · Tools:{' '}
              {run.tool_calls ?? 0}
            </div>
            <div className="small-text">
              Energy: {run.energy_report?.kwh ?? '—'} kWh ({run.energy_report?.region ?? 'n/a'}) · Quality:{' '}
              {run.quality_evaluation?.score ?? run.quality_score ?? '—'}
            </div>
            <div className="small-text">Created: {run.created_at ?? 'n/a'}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
