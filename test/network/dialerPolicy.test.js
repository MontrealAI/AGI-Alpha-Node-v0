import { describe, expect, it } from 'vitest';
import { DialerPolicy, buildDialerPolicyConfig } from '../../src/network/dialerPolicy.js';

describe('DialerPolicy', () => {
  it('computes exponential backoff with caps', () => {
    const policy = new DialerPolicy(
      buildDialerPolicyConfig({
        config: {
          DIAL_BACKOFF_INITIAL_MS: 100,
          DIAL_BACKOFF_MAX_MS: 1000,
          DIAL_MAX_RETRIES: 4
        }
      })
    );

    expect(policy.nextBackoff('peer-a', 1)).toBe(100);
    expect(policy.nextBackoff('peer-a', 2)).toBe(200);
    expect(policy.nextBackoff('peer-a', 4)).toBe(800);
    expect(policy.nextBackoff('peer-a', 6)).toBe(1000);

    const retry = policy.shouldRetry('peer-a', 5, 0);
    expect(retry.retry).toBe(false);
  });

  it('recommends outbound dials when ratio falls below target', () => {
    const planner = new DialerPolicy(
      buildDialerPolicyConfig({
        config: {
          DIAL_OUTBOUND_TARGET_RATIO: 0.6,
          DIAL_OUTBOUND_RATIO_TOLERANCE: 0.1,
          DIAL_OUTBOUND_MIN_CONNECTIONS: 10
        }
      })
    );

    const plan = planner.computeOutboundPlan({ outbound: 20, inbound: 40, dialable: 50 });
    expect(plan.shouldDial).toBe(true);
    expect(plan.desiredOutbound).toBeGreaterThanOrEqual(36);
    expect(plan.planDialCount).toBeGreaterThan(0);
  });
});
