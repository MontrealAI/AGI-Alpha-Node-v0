import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import { vi } from 'vitest';

vi.mock('react-chartjs-2', () => ({
  Line: (props) => <div data-testid="chart" {...props} />
}));

vi.mock('./api/client.js', () => {
  const mockHistory = [{ effective_date: '2024-01-01', headline_value: 1.234 }];
  const mockProviders = {
    providers: [
      {
        id: 1,
        name: 'demo-provider',
        region: 'na',
        sector_tags: ['research'],
        latest_score: {
          slu: 1.111,
          energy_adjustment: 1.02,
          quality_adjustment: 0.98,
          consensus_factor: 1.01
        }
      }
    ]
  };
  const mockScores = { provider: mockProviders.providers[0], scores: [{ measurement_date: '2024-01-01', slu: 1.234 }] };
  const mockTelemetry = {
    task_runs: [
      {
        id: 'run-1',
        status: 'completed',
        provider_id: 1,
        provider: mockProviders.providers[0],
        task_type: { id: 1, name: 'synthetic-demo' },
        raw_throughput: 2,
        tokens_processed: 10,
        tool_calls: 1,
        energy_report: { kwh: 1.2, region: 'na' },
        quality_evaluation: { score: 0.95 },
        created_at: '2024-01-01T00:00:00Z'
      }
    ],
    window: { from: '2024-01-01', to: '2024-01-02' },
    pagination: { total: 1, limit: 50, offset: 0, nextOffset: null }
  };

  return {
    fetchIndexHistory: vi.fn().mockResolvedValue({ items: mockHistory }),
    fetchProviders: vi.fn().mockResolvedValue(mockProviders),
    fetchProviderScores: vi.fn().mockResolvedValue(mockScores),
    fetchTelemetryRuns: vi.fn().mockResolvedValue(mockTelemetry),
    fetchDebugNetwork: vi.fn().mockResolvedValue({
      windowMinutes: 15,
      reachability: { current: { state: 'public', updatedAt: Date.now() }, timeline: [] },
      transportPosture: { connectionsByTransport: { quic: 5, tcp: 3 }, share: { quic: 0.62, tcp: 0.38 } },
      churn: { live: { in: 1, out: 2 }, opensPerSec: { in: 0.1, out: 0.2 }, closesPerSec: { in: 0.05, out: 0.1 } },
      dials: { recent: { successRate: 0.9 }, cumulative: { successRate: 0.95 } }
    }),
    fetchDebugResources: vi.fn().mockResolvedValue({
      nrmDenials: { byLimitType: { streams: 1 }, byProtocol: { '/meshsub/1.1.0': 1 } },
      connectionManagerStats: { trims: { over_high_water: 1 } }
    })
  };
});

function getNavButton(label) {
  return screen.getByRole('tab', { name: new RegExp(label, 'i') });
}

describe('Dashboard shell', () => {
  it('renders index view with hydrated headline and allows tab changes', async () => {
    render(<App />);

    expect(screen.getByText(/AGI Alpha Node · Debug Deck/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('1.234')).toBeInTheDocument());

    await userEvent.click(getNavButton('Providers'));
    expect(await screen.findByText('demo-provider')).toBeInTheDocument();
    expect(screen.getByText('1.111')).toBeInTheDocument();

    await userEvent.click(getNavButton('Telemetry'));
    expect(await screen.findByRole('heading', { level: 2, name: /Telemetry debug/i })).toBeInTheDocument();
    const telemetryProviders = await screen.findAllByText(/demo-provider/);
    expect(telemetryProviders.length).toBeGreaterThan(0);
  });
});
