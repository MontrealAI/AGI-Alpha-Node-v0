import React, { useEffect, useMemo, useState } from 'react';
import { fetchDebugNetwork, fetchDebugResources, fetchProviders, fetchTelemetryRuns } from '../api/client.js';

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
  const [networkDebug, setNetworkDebug] = useState(null);
  const [resourceDebug, setResourceDebug] = useState(null);
  const [networkError, setNetworkError] = useState(null);

  const windowMinutes = networkDebug?.windowMinutes ?? 15;

  function formatNumber(value, digits = 2) {
    return Number.isFinite(value) ? value.toFixed(digits) : '—';
  }

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

  async function loadNetworkSurfaces() {
    try {
      const [networkPayload, resourcePayload] = await Promise.all([
        fetchDebugNetwork(baseUrl, apiKey, { windowMinutes: 15 }),
        fetchDebugResources(baseUrl, apiKey)
      ]);
      setNetworkDebug(networkPayload);
      setResourceDebug(resourcePayload);
    } catch (err) {
      setNetworkError(err.message);
    }
  }

  useEffect(() => {
    loadProviders();
    loadNetworkSurfaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, apiKey, refreshNonce]);

  useEffect(() => {
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, providerId, baseUrl, apiKey, refreshNonce]);

  return (
    <>
      <section className="panel" aria-label="Network posture">
        <h2>🌐 Network posture</h2>
        <p className="hint">Read-only overlays from /debug/network and /debug/resources (window ≈ {windowMinutes}m).</p>
        {networkError && <div className="badge warning">{networkError}</div>}

        <div className="metrics-grid">
          <div className="metric-card">
            <div className="label">Transport posture</div>
            {Object.keys(networkDebug?.transportPosture?.connectionsByTransport ?? {}).length === 0 ? (
              <div className="small-text">No dial data yet.</div>
            ) : (
              <ul className="log-list">
                {Object.entries(networkDebug?.transportPosture?.connectionsByTransport ?? {}).map(([transport, count]) => (
                  <li key={transport} className="log-item">
                    <div className="small-text">{transport.toUpperCase()}</div>
                    <div className="small-text">
                      Recent connections: {formatNumber(count, 2)} · Share:{' '}
                      {formatNumber((networkDebug?.transportPosture?.share?.[transport] ?? 0) * 100, 1)}%
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="metric-card">
            <div className="label">Reachability timeline</div>
            <div className="small-text">Current: {networkDebug?.reachability?.current?.state ?? 'unknown'}</div>
            <ul className="log-list">
              {(networkDebug?.reachability?.timeline ?? []).slice(-4).reverse().map((entry, idx) => (
                <li key={`${entry.updatedAt ?? idx}`} className="log-item">
                  <div className="small-text">{entry.state} · source {entry.source}</div>
                  <div className="small-text">
                    {entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : '—'}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="metric-card">
            <div className="label">Resource pressure</div>
            {resourceDebug?.nrmDenials ? (
              <div className="small-text">
                Limits: {JSON.stringify(resourceDebug.nrmDenials.byLimitType)}
                <br /> Protocols: {JSON.stringify(resourceDebug.nrmDenials.byProtocol)}
                <br /> Trims: {JSON.stringify(resourceDebug.connectionManagerStats?.trims ?? {})}
              </div>
            ) : (
              <div className="small-text">NRM counters unavailable.</div>
            )}
          </div>

          <div className="metric-card">
            <div className="label">Churn & dials</div>
            <div className="small-text">
              Live: in {networkDebug?.churn?.live?.in ?? 0} / out {networkDebug?.churn?.live?.out ?? 0}
            </div>
            <div className="small-text">
              Opens: in {formatNumber(networkDebug?.churn?.opensPerSec?.in ?? 0)} / out {formatNumber(networkDebug?.churn?.opensPerSec?.out ?? 0)}
            </div>
            <div className="small-text">
              Closes: in {formatNumber(networkDebug?.churn?.closesPerSec?.in ?? 0)} / out {formatNumber(networkDebug?.churn?.closesPerSec?.out ?? 0)}
            </div>
            <div className="small-text">Dial success (window): {formatNumber(networkDebug?.dials?.recent?.successRate ?? 0, 3)}</div>
            <div className="small-text">
              Dial success (cumulative): {formatNumber(networkDebug?.dials?.cumulative?.successRate ?? 0, 3)}
            </div>
          </div>
        </div>
      </section>

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
                Throughput: {run.raw_throughput ?? 0} · Tokens: {run.tokens_processed ?? 0} · Tools {run.tool_calls ?? 0}
              </div>
              <div className="small-text">
                Energy: {run.energy_report?.kwh ?? '—'} kWh ({run.energy_report?.region ?? 'n/a'}) · Quality {run.quality_evaluation?.score ?? run.quality_score ?? '—'}
              </div>
              <div className="small-text">Created: {run.created_at ?? 'n/a'}</div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
