import pino from 'pino';

const logger = pino({ level: 'info', name: 'dialer-policy' });

function coerceNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function buildDialerPolicyConfig({ config = {}, baseLogger } = {}) {
  const log = typeof baseLogger?.info === 'function' ? baseLogger : logger;
  const policy = {
    timeoutMs: coerceNumber(config.DIAL_TIMEOUT_MS, 10_000),
    maxRetries: coerceNumber(config.DIAL_MAX_RETRIES, 5),
    backoff: {
      initialMs: coerceNumber(config.DIAL_BACKOFF_INITIAL_MS, 500),
      maxMs: coerceNumber(config.DIAL_BACKOFF_MAX_MS, 30_000),
      factor: 2
    },
    outbound: {
      targetRatio: coerceNumber(config.DIAL_OUTBOUND_TARGET_RATIO, 0.6),
      tolerance: coerceNumber(config.DIAL_OUTBOUND_RATIO_TOLERANCE, 0.1),
      minConnections: coerceNumber(config.DIAL_OUTBOUND_MIN_CONNECTIONS, 64),
      reconcileIntervalMs: coerceNumber(config.DIAL_RECONCILE_INTERVAL_MS, 15_000)
    }
  };

  log.info({ policy }, 'Dialer policy synthesized');
  return policy;
}

export class DialerPolicy {
  constructor(policyConfig = buildDialerPolicyConfig()) {
    this.policy = policyConfig;
    this.attempts = new Map();
    this.lastDialAt = 0;
  }

  nextBackoff(peerId, attempt = 1) {
    const normalizedAttempt = Math.max(1, attempt);
    const baseDelay = this.policy.backoff.initialMs * 2 ** (normalizedAttempt - 1);
    return Math.min(baseDelay, this.policy.backoff.maxMs);
  }

  shouldRetry(peerId, attempt, nowMs = Date.now()) {
    if (attempt > this.policy.maxRetries) {
      return { retry: false, delayMs: null };
    }

    const delayMs = this.nextBackoff(peerId, attempt);
    const lastAttempt = this.attempts.get(peerId) ?? 0;
    const timeSinceLast = nowMs - lastAttempt;
    const waitMore = delayMs - timeSinceLast;
    return { retry: true, delayMs: Math.max(waitMore, 0) };
  }

  recordAttempt(peerId, nowMs = Date.now()) {
    this.attempts.set(peerId, nowMs);
    this.lastDialAt = Math.max(this.lastDialAt, nowMs);
  }

  computeOutboundPlan({ outbound = 0, inbound = 0, dialable = 0 } = {}) {
    const total = outbound + inbound;
    const ratio = total > 0 ? outbound / total : 1;
    const target = this.policy.outbound.targetRatio;
    const tolerance = this.policy.outbound.tolerance;
    const lowerBound = Math.max(target - tolerance, 0);
    const upperBound = Math.min(target + tolerance, 1);

    const desiredOutbound = Math.max(Math.ceil((inbound + outbound) * target), this.policy.outbound.minConnections);
    const deficit = Math.max(desiredOutbound - outbound, 0);
    const planDialCount = Math.min(deficit, Math.max(dialable, deficit));

    return {
      ratio,
      lowerBound,
      upperBound,
      desiredOutbound,
      deficit,
      shouldDial: ratio < lowerBound,
      planDialCount
    };
  }
}
