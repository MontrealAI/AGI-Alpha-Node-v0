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
import { fetchProviderScores, fetchProviders } from '../api/client.js';

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

export function ProvidersView({ baseUrl, apiKey, onApiKeyChange }) {
  const { from: defaultFrom, to: defaultTo } = useMemo(() => defaultWindow(), []);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [scores, setScores] = useState([]);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function loadProviders() {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchProviders(baseUrl, apiKey, { limit: 100 });
      setProviders(payload.providers ?? []);
      if (!selectedProvider && payload.providers?.length) {
        setSelectedProvider(payload.providers[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadScores(targetProvider = selectedProvider) {
    if (!targetProvider) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchProviderScores(baseUrl, apiKey, targetProvider.id, { from, to });
      setScores(payload.scores ?? []);
      setSelectedProvider(payload.provider ?? targetProvider);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, apiKey]);

  useEffect(() => {
    if (selectedProvider) {
      loadScores(selectedProvider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const chartData = useMemo(() => {
    const labels = (scores ?? []).map((entry) => entry.measurement_date ?? entry.as_of_date);
    const data = (scores ?? []).map((entry) => entry.slu ?? entry.score ?? 0);
    return {
      labels,
      datasets: [
        {
          label: 'SLU',
          data,
          tension: 0.2,
          borderColor: 'rgba(34, 197, 94, 0.9)',
          backgroundColor: 'rgba(34, 197, 94, 0.18)',
          fill: true,
          pointRadius: 3
        }
      ]
    };
  }, [scores]);

  return (
    <section className="panel" aria-label="Provider detail view">
      <h2>🛰️ Providers & SLU signal</h2>
      <p className="hint">Registry plus SLU traces per provider. Select a row to drill into its trajectory.</p>

      <div className="controls">
        <label>
          Public API key
          <input
            type="text"
            placeholder="x-api-key"
            value={apiKey}
            onChange={(event) => onApiKeyChange?.(event.target.value)}
          />
        </label>
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="primary-button" type="button" onClick={() => loadScores(selectedProvider)} disabled={loading}>
          {loading ? 'Syncing…' : 'Refresh selections'}
        </button>
      </div>

      {error && <div className="badge warning">{error}</div>}

      <div className="panel">
        <table className="table" role="grid">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Region</th>
              <th>Sector</th>
              <th>Latest SLU</th>
              <th>Energy adj.</th>
              <th>Quality adj.</th>
            </tr>
          </thead>
          <tbody>
            {(providers ?? []).map((provider) => {
              const score = provider.latest_score;
              return (
                <tr
                  key={provider.id}
                  onClick={() => {
                    setSelectedProvider(provider);
                    loadScores(provider);
                  }}
                  aria-selected={selectedProvider?.id === provider.id}
                >
                  <td>{provider.name}</td>
                  <td>{provider.region ?? '—'}</td>
                  <td>{provider.sector_tags?.join?.(', ') ?? '—'}</td>
                  <td>{score?.slu?.toFixed?.(3) ?? '—'}</td>
                  <td>{score?.energy_adjustment ? score.energy_adjustment.toFixed(2) : '—'}</td>
                  <td>{score?.quality_adjustment ? score.quality_adjustment.toFixed(2) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>
          {selectedProvider ? `${selectedProvider.name} · SLU over time` : 'Select a provider to view SLU trends'}
        </h3>
        <Line
          data={chartData}
          options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
          height={300}
        />
      </div>
    </section>
  );
}
