import React, { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { fetchIndexHistory } from '../api/client.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function defaultWindow() {
  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: toIsoDate(from), to: toIsoDate(today) };
}

export function IndexView({ baseUrl, apiKey, refreshNonce = 0 }) {
  const { from: defaultFrom, to: defaultTo } = useMemo(() => defaultWindow(), []);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const history = await fetchIndexHistory(baseUrl, apiKey, { from, to });
      setSeries(history.items ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, baseUrl, apiKey, refreshNonce]);

  const chartData = useMemo(() => {
    const labels = (series ?? []).map((entry) => entry.effective_date);
    const data = (series ?? []).map((entry) => entry.headline_value ?? 0);
    return {
      labels,
      datasets: [
        {
          label: 'GSLI Headline',
          data,
          tension: 0.25,
          borderColor: 'rgba(56, 189, 248, 0.9)',
          backgroundColor: 'rgba(56, 189, 248, 0.2)',
          fill: true,
          pointRadius: 3
        }
      ]
    };
  }, [series]);

  const latest = series?.[0];
  const trend = useMemo(() => {
    if (!series || series.length < 2) return 0;
    const first = series[series.length - 1]?.headline_value ?? 0;
    const last = series[0]?.headline_value ?? 0;
    return Number(((last - first) / Math.max(first, 1)).toFixed(4));
  }, [series]);

  return (
    <section className="panel" aria-label="Global Synthetic Labor Index">
      <h2>📈 Global Synthetic Labor Index</h2>
      <p className="hint">Live GSLI curve from the public API with rebalance metadata.</p>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="label">Latest headline</div>
          <div className="value">{latest?.headline_value?.toFixed?.(3) ?? '—'}</div>
          <div className="small-text">Effective {latest?.effective_date ?? 'n/a'}</div>
        </div>
        <div className="metric-card">
          <div className="label">Window</div>
          <div className="value">{from} → {to}</div>
          <div className="small-text">{series?.length ?? 0} points</div>
        </div>
        <div className="metric-card">
          <div className="label">Trend</div>
          <div className={`value ${trend >= 0 ? 'text-success' : 'text-warning'}`}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend * 100).toFixed(2)}%
          </div>
          <div className="small-text">Δ over window</div>
        </div>
      </div>

      <div className="controls">
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="primary-button" type="button" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="badge warning">{error}</div>}

      <div className="panel">
        <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} height={320} />
      </div>
    </section>
  );
}
