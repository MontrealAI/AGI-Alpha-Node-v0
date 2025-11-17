/* @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('chart.js', () => {
  const register = vi.fn();
  return {
    Chart: { register },
    CategoryScale: {},
    LinearScale: {},
    PointElement: {},
    LineElement: {},
    Tooltip: {},
    Legend: {}
  };
});

vi.mock('react-chartjs-2', () => ({
  Line: (props) => <div data-testid="chart" {...props} />
}));

import App from '../dashboard/src/App.jsx';

const mockData = {
  indexHistory: {
    window: { from: '2024-01-01', to: '2024-01-30' },
    pagination: { total: 3, limit: 30, offset: 0 },
    items: [
      { id: 3, effective_date: '2024-01-03', headline_value: 25.4 },
      { id: 2, effective_date: '2024-01-02', headline_value: 24.8 },
      { id: 1, effective_date: '2024-01-01', headline_value: 24.1 }
    ]
  },
  providers: {
    providers: [
      {
        id: 1,
        name: 'helios-labs',
        region: 'na-east',
        sector_tags: ['llm'],
        latest_score: { slu: 0.86, energy_adjustment: 0.98, quality_adjustment: 1.02, measurement_date: '2024-01-03' }
      },
      {
        id: 2,
        name: 'aurora',
        region: 'eu-west',
        sector_tags: ['cv'],
        latest_score: { slu: 0.73, energy_adjustment: 1.1, quality_adjustment: 0.96, measurement_date: '2024-01-03' }
      }
    ],
    pagination: { total: 2, limit: 50, offset: 0 }
  },
  providerScores: {
    provider: { id: 1, name: 'helios-labs', region: 'na-east' },
    scores: [
      { id: 11, measurement_date: '2024-01-03', slu: 0.86 },
      { id: 10, measurement_date: '2024-01-02', slu: 0.82 }
    ],
    pagination: { total: 2, limit: 90, offset: 0 }
  },
  telemetry: {
    window: { from: '2024-01-01', to: '2024-01-07' },
    pagination: { total: 1, limit: 50, offset: 0 },
    task_runs: [
      {
        id: 41,
        provider_id: 1,
        provider: { id: 1, name: 'helios-labs' },
        status: 'completed',
        raw_throughput: 120,
        tokens_processed: 1200,
        tool_calls: 2,
        energy_report: { kwh: 3.5, region: 'na-east' },
        quality_evaluation: { score: 0.91 },
        created_at: '2024-01-03T12:00:00Z'
      }
    ]
  }
};

function responseFrom(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

beforeEach(() => {
  global.fetch = vi.fn(async (url) => {
    const target = typeof url === 'string' ? url : url.url;
    if (target.includes('/index/history')) {
      return responseFrom(mockData.indexHistory);
    }
    if (target.includes('/providers/') && target.includes('/scores')) {
      return responseFrom(mockData.providerScores);
    }
    if (target.includes('/providers')) {
      return responseFrom(mockData.providers);
    }
    if (target.includes('/telemetry/task-runs')) {
      return responseFrom(mockData.telemetry);
    }
    throw new Error(`Unhandled fetch: ${target}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('renders dashboard views and hydrates via mocked API', async () => {
  render(<App />);

  expect(await screen.findByText(/Global Synthetic Labor Index/i)).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/index/history'), expect.anything()));

  const providersTab = screen.getByRole('tab', { name: /Providers/ });
  fireEvent.click(providersTab);
  expect(await screen.findByRole('cell', { name: /helios-labs/ })).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/providers'), expect.anything()));
  const providerRow = screen.getByRole('row', { name: /helios-labs/ });
  fireEvent.click(providerRow);
  await waitFor(() =>
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/providers/1/scores'), expect.anything())
  );

  const telemetryTab = screen.getByRole('tab', { name: /Telemetry Debug/ });
  fireEvent.click(telemetryTab);
  expect(await screen.findByText(/energy: 3.5 kWh/i)).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/telemetry/task-runs'), expect.anything()));
});
