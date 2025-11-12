import http from 'node:http';
import { collectDefaultMetrics, Gauge, Registry } from 'prom-client';

export function startMonitoringServer({ port = 9464, logger }) {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'agi_alpha_node_' });

  const stakeGauge = new Gauge({
    name: 'agi_alpha_node_stake_balance',
    help: 'Current $AGIALPHA stake recorded for this operator',
    registers: [registry]
  });

  const heartbeatGauge = new Gauge({
    name: 'agi_alpha_node_last_heartbeat',
    help: 'Last heartbeat timestamp observed for the operator',
    registers: [registry]
  });

  const jobThroughputGauge = new Gauge({
    name: 'agi_alpha_node_job_throughput',
    help: 'Jobs completed per monitor interval based on swarm orchestration',
    registers: [registry]
  });

  const jobSuccessGauge = new Gauge({
    name: 'agi_alpha_node_job_success_rate',
    help: 'Rolling success ratio of historical jobs (0-1 scale)',
    registers: [registry]
  });

  const tokenEarningsGauge = new Gauge({
    name: 'agi_alpha_node_token_earnings_projection',
    help: 'Projected $AGIALPHA earnings for the upcoming epoch',
    registers: [registry]
  });

  const agentUtilizationGauge = new Gauge({
    name: 'agi_alpha_node_agent_utilization',
    help: 'Utilization ratio per sub-agent derived from the orchestrator',
    labelNames: ['agent'],
    registers: [registry]
  });

  const providerModeGauge = new Gauge({
    name: 'agi_alpha_node_provider_mode',
    help: 'Current intelligence provider mode (remote, local, offline)',
    labelNames: ['mode'],
    registers: [registry]
  });

  const registryProfileGauge = new Gauge({
    name: 'agi_alpha_node_registry_profile',
    help: 'Active JobRegistry profile indicator',
    labelNames: ['profile'],
    registers: [registry]
  });

  const registryCompatibilityGauge = new Gauge({
    name: 'agi_alpha_node_registry_compatibility_warning',
    help: 'ABI compatibility warnings detected for the active JobRegistry profile',
    labelNames: ['profile', 'reason'],
    registers: [registry]
  });

  const healthGateGauge = new Gauge({
    name: 'agi_alpha_node_health_gate_state',
    help: 'Current health gate posture based on ENS allowlist and stake readiness',
    labelNames: ['state'],
    registers: [registry]
  });

  const alphaAcceptanceGauge = new Gauge({
    name: 'agi_alpha_node_alpha_wu_acceptance_rate',
    help: 'Acceptance rate for alpha work units (0-1 scale)',
    labelNames: ['window'],
    registers: [registry]
  });

  const alphaOnTimeGauge = new Gauge({
    name: 'agi_alpha_node_alpha_wu_on_time_p95_seconds',
    help: 'p95 completion latency for alpha work units in seconds',
    labelNames: ['window'],
    registers: [registry]
  });

  const alphaYieldGauge = new Gauge({
    name: 'agi_alpha_node_alpha_wu_slash_adjusted_yield',
    help: 'Slashing-adjusted yield for alpha work units',
    labelNames: ['window'],
    registers: [registry]
  });

  const alphaQualityGauge = new Gauge({
    name: 'agi_alpha_node_alpha_wu_quality',
    help: 'Validator-weighted quality score for alpha work units by dimension',
    labelNames: ['window', 'dimension', 'key'],
    registers: [registry]
  });

  const alphaBreakdownGauge = new Gauge({
    name: 'agi_alpha_node_alpha_wu_breakdown',
    help: 'Alpha work unit KPI breakdowns by dimension and metric',
    labelNames: ['window', 'dimension', 'metric', 'key'],
    registers: [registry]
  });

  const server = http.createServer(async (req, res) => {
    if (req.url === '/metrics') {
      const metrics = await registry.metrics();
      res.writeHead(200, { 'Content-Type': registry.contentType });
      res.end(metrics);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    logger?.info?.({ port }, 'Telemetry server listening');
  });

  return {
    registry,
    server,
    stakeGauge,
    heartbeatGauge,
    jobThroughputGauge,
    jobSuccessGauge,
    tokenEarningsGauge,
    agentUtilizationGauge,
    providerModeGauge,
    registryProfileGauge,
    registryCompatibilityGauge,
    healthGateGauge,
    alphaAcceptanceGauge,
    alphaOnTimeGauge,
    alphaYieldGauge,
    alphaQualityGauge,
    alphaBreakdownGauge
  };
}
