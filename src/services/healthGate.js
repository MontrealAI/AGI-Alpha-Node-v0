import pino from 'pino';

const DEFAULT_ALLOWLIST = [
  '*.agent.agi.eth',
  '*.alpha.agent.agi.eth',
  '*.node.agi.eth',
  '*.alpha.node.agi.eth',
  '*.alpha.club.agi.eth',
  '*.club.agi.eth'
];

function normalizeEnsName(value) {
  if (!value) {
    return null;
  }
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
}

function normalizeAllowlist(values) {
  if (!values) {
    return [...DEFAULT_ALLOWLIST];
  }
  const list = Array.isArray(values) ? values : [values];
  const normalized = list
    .map((entry) => normalizeEnsName(entry))
    .filter((entry, index, arr) => entry && arr.indexOf(entry) === index);
  return normalized.length ? normalized : [...DEFAULT_ALLOWLIST];
}

function matchesPattern(name, pattern) {
  const normalizedName = normalizeEnsName(name);
  const normalizedPattern = normalizeEnsName(pattern);
  if (!normalizedName || !normalizedPattern) {
    return false;
  }
  if (normalizedPattern === normalizedName) {
    return true;
  }
  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(1);
    return normalizedName.endsWith(suffix) && normalizedName.length > suffix.length;
  }
  return false;
}

export function createHealthGate({ allowlist, initialHealthy = false, logger = pino({ level: 'info', name: 'health-gate' }) } = {}) {
  const patterns = normalizeAllowlist(allowlist);
  const state = {
    isHealthy: Boolean(initialHealthy),
    activeEns: null,
    lastSource: null,
    lastUpdatedAt: null,
    transitions: [],
    lastRejection: null
  };

  function logTransition(newState) {
    const entry = {
      at: new Date().toISOString(),
      isHealthy: newState.isHealthy,
      source: newState.lastSource,
      ens: newState.activeEns
    };
    state.transitions.push(entry);
    if (state.transitions.length > 50) {
      state.transitions.shift();
    }
  }

  function setStatus({
    isHealthy,
    ensName,
    source = 'unknown',
    force = false
  }) {
    const normalizedName = normalizeEnsName(ensName);
    if (!force && normalizedName && !patterns.some((pattern) => matchesPattern(normalizedName, pattern))) {
      state.lastRejection = {
        reason: 'ens-not-allowed',
        attemptedEns: normalizedName,
        source,
        at: new Date().toISOString()
      };
      logger?.warn?.({ ensName: normalizedName, source }, 'Health gate rejection: ENS not allowlisted');
      return false;
    }
    const targetState = Boolean(isHealthy);
    const hasChanged = state.isHealthy !== targetState || state.activeEns !== normalizedName;
    state.isHealthy = targetState;
    state.activeEns = normalizedName;
    state.lastSource = source;
    state.lastUpdatedAt = new Date().toISOString();
    state.lastRejection = null;
    if (hasChanged) {
      logTransition({
        isHealthy: state.isHealthy,
        activeEns: state.activeEns,
        lastSource: state.lastSource
      });
      logger?.info?.(
        {
          isHealthy: state.isHealthy,
          ens: state.activeEns,
          source: state.lastSource
        },
        'Health gate status updated'
      );
    }
    return true;
  }

  function updateFromDiagnostics({
    ensName,
    stakeEvaluation,
    diagnosticsHealthy,
    source = 'diagnostics'
  } = {}) {
    const normalizedName = normalizeEnsName(ensName);
    const meetsStake = Boolean(stakeEvaluation?.meets);
    const penaltyActive = Boolean(stakeEvaluation?.penaltyActive);
    const healthyByStake = diagnosticsHealthy ?? (meetsStake && !penaltyActive);
    return setStatus({ isHealthy: healthyByStake, ensName: normalizedName, source });
  }

  function shouldEmitAlphaEvent({ type }) {
    if (!state.isHealthy) {
      logger?.debug?.({ type }, 'Alpha event emission skipped due to unhealthy gate');
      return false;
    }
    return true;
  }

  return {
    isHealthy: () => state.isHealthy,
    getActiveEns: () => state.activeEns,
    getAllowlist: () => [...patterns],
    getState: () => ({
      isHealthy: state.isHealthy,
      activeEns: state.activeEns,
      lastSource: state.lastSource,
      lastUpdatedAt: state.lastUpdatedAt,
      lastRejection: state.lastRejection,
      transitions: [...state.transitions]
    }),
    setStatus,
    updateFromDiagnostics,
    shouldEmitAlphaEvent,
    matchesAllowlist: (value) => patterns.some((pattern) => matchesPattern(value, pattern))
  };
}

export { normalizeEnsName, matchesPattern };
