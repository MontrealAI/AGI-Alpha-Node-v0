import React, { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { fetchDebugNetwork, fetchDebugResources, fetchProviders, fetchTelemetryRuns } from '../api/client.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, Legend, LineElement, LinearScale, PointElement, Tooltip);

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

  const reachabilitySeries = useMemo(() => {
    const timeline = (networkDebug?.reachability?.timeline ?? []).slice(-20);
    const map = { public: 2, private: 1, unknown: 0 };
    const labels = timeline.map((entry) => new Date(entry.updatedAt ?? Date.now()).toLocaleTimeString());
    const data = timeline.map((entry) => map[entry.state] ?? 0);
    return {
      labels,
      datasets: [
        {
          label: 'Reachability (2=public,1=private,0=unknown)',
          data,
          borderColor: 'rgba(139, 92, 246, 0.9)',
          backgroundColor: 'rgba(139, 92, 246, 0.25)',
          tension: 0.25,
          fill: true,
          pointRadius: 2
        }
      ]
    };
  }, [networkDebug]);

  const transportPostureData = useMemo(() => {
    const connections = networkDebug?.transportPosture?.connectionsByTransport ?? {};
    const labels = Object.keys(connections);
    if (labels.length === 0) return null;
    const shares = labels.map((label) => (networkDebug?.transportPosture?.share?.[label] ?? 0) * 100);
    return {
      labels: labels.map((label) => label.toUpperCase()),
      datasets: [
        {
          label: 'Share of recent connections (%)',
          data: shares,
          backgroundColor: ['#22c55e', '#0ea5e9', '#f97316', '#eab308']
        }
      ]
    };
  }, [networkDebug]);

  const churnDialData = useMemo(() => {
    const opens = networkDebug?.churn?.opensPerSec ?? {};
    const closes = networkDebug?.churn?.closesPerSec ?? {};
    const successRate = networkDebug?.dials?.recent?.successRate ?? 0;
    const failure = networkDebug?.dials?.recent?.failure ?? {};
    const success = networkDebug?.dials?.recent?.success ?? {};
    const transports = Array.from(new Set([...Object.keys(success ?? {}), ...Object.keys(failure ?? {})]));
    const dialTotals = transports.map(
      (transport) => (success?.[transport] ?? 0) + (failure?.[transport] ?? 0)
    );
    return {
      churn: {
        labels: ['Opens (in)', 'Opens (out)', 'Closes (in)', 'Closes (out)'],
        datasets: [
          {
            label: 'Connections/sec',
            data: [opens.in ?? 0, opens.out ?? 0, closes.in ?? 0, closes.out ?? 0],
            backgroundColor: '#0ea5e9'
          }
        ]
      },
      dials: {
        labels: transports.map((label) => label.toUpperCase()),
        datasets: [
          {
            label: 'Dial attempts (recent window)',
            data: dialTotals,
            backgroundColor: '#22c55e'
          }
        ],
        successRate
      }
    };
  }, [networkDebug]);

  const nrmPressureData = useMemo(() => {
    const recent = resourceDebug?.nrmDenials?.recent;
    const totals = resourceDebug?.nrmDenials;
    if (!recent && !totals) return null;
    const limitLabelsRaw = Object.keys(recent?.byLimitType ?? totals?.byLimitType ?? {});
    const protocolLabelsRaw = Object.keys(recent?.byProtocol ?? totals?.byProtocol ?? {});
    const limitLabels = limitLabelsRaw.length ? limitLabelsRaw : ['none'];
    const protocolLabels = protocolLabelsRaw.length ? protocolLabelsRaw : ['none'];
    return {
      limitType: {
        labels: limitLabels.map((label) => label.toUpperCase()),
        datasets: [
          {
            label: 'Denials (recent window)',
            data: limitLabels.map((label) => recent?.byLimitType?.[label] ?? 0),
            backgroundColor: '#f97316'
          }
        ]
      },
      protocol: {
        labels: protocolLabels.map((label) => label.toUpperCase()),
        datasets: [
          {
            label: 'Denials (recent window)',
            data: protocolLabels.map((label) => recent?.byProtocol?.[label] ?? 0),
            backgroundColor: '#eab308'
          }
        ]
      },
      trims: {
        labels: Object.keys(resourceDebug?.connectionManagerStats?.recent?.byReason ?? {}),
        datasets: [
          {
            label: 'Trims (recent window)',
            data: Object.values(resourceDebug?.connectionManagerStats?.recent?.byReason ?? {}),
            backgroundColor: '#8b5cf6'
          }
        ],
        windowSeconds: resourceDebug?.connectionManagerStats?.recent?.windowSeconds ?? 0,
        windowMinutes: resourceDebug?.windowMinutes ?? 0
      }
    };
  }, [resourceDebug]);

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
      const requestWindowMinutes = networkDebug?.windowMinutes ?? 15;
      const [networkPayload, resourcePayload] = await Promise.all([
        fetchDebugNetwork(baseUrl, apiKey, { windowMinutes: requestWindowMinutes }),
        fetchDebugResources(baseUrl, apiKey, { windowMinutes: requestWindowMinutes })
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
            {transportPostureData ? (
              <Doughnut data={transportPostureData} aria-label="Transport posture share" />
            ) : (
              <div className="small-text">No dial data yet.</div>
            )}
          </div>

          <div className="metric-card">
            <div className="label">Reachability timeline</div>
            <div className="small-text">Current: {networkDebug?.reachability?.current?.state ?? 'unknown'}</div>
            <Line data={reachabilitySeries} options={{ scales: { y: { ticks: { stepSize: 1, max: 2, min: 0 } } } }} />
          </div>

          <div className="metric-card">
            <div className="label">Resource pressure</div>
            {nrmPressureData ? (
              <>
                <Bar data={nrmPressureData.limitType} aria-label="NRM denials by limit" />
                <Bar data={nrmPressureData.protocol} aria-label="NRM denials by protocol" />
                <Bar data={nrmPressureData.trims} aria-label="Connection trims" />
                <div className="small-text">
                  Window: {nrmPressureData.trims.windowMinutes ?? windowMinutes}m · Recent denials captured
                </div>
              </>
            ) : (
              <div className="small-text">NRM counters unavailable.</div>
            )}
          </div>

          <div className="metric-card">
            <div className="label">Churn & dials</div>
            <div className="small-text">
              Live: in {networkDebug?.churn?.live?.in ?? 0} / out {networkDebug?.churn?.live?.out ?? 0}
            </div>
            <Bar data={churnDialData.churn} aria-label="Connection churn" />
            <Bar data={churnDialData.dials} aria-label="Dial attempts" />
            <div className="small-text">Dial success (window): {formatNumber(churnDialData.dials.successRate ?? 0, 3)}</div>
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
