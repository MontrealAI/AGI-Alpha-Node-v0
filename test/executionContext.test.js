import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDeviceInfo, getSlaProfile, __test__resolveVramTier } from '../src/services/executionContext.js';
import { SLA_PROFILES, VRAM_TIERS } from '../src/constants/workUnits.js';

const ORIGINAL_DEFAULT_SLA = process.env.DEFAULT_SLA_PROFILE;

describe('execution context helpers', () => {
  beforeEach(() => {
    if (ORIGINAL_DEFAULT_SLA === undefined) {
      delete process.env.DEFAULT_SLA_PROFILE;
    } else {
      process.env.DEFAULT_SLA_PROFILE = ORIGINAL_DEFAULT_SLA;
    }
  });

  afterEach(() => {
    if (ORIGINAL_DEFAULT_SLA === undefined) {
      delete process.env.DEFAULT_SLA_PROFILE;
    } else {
      process.env.DEFAULT_SLA_PROFILE = ORIGINAL_DEFAULT_SLA;
    }
  });

  describe('getDeviceInfo', () => {
    it('derives device metadata from environment inputs', () => {
      const info = getDeviceInfo({
        env: {
          PROVIDER_LABEL: 'orchestrator-eu-central',
          GPU_MODEL: 'NVIDIA-H100',
          GPU_VRAM_GB: '80',
          GPU_COUNT: '4'
        }
      });

      expect(info).toEqual(
        expect.objectContaining({
          providerLabel: 'orchestrator-eu-central',
          deviceClass: 'NVIDIA-H100',
          gpuCount: 4,
          vramTier: VRAM_TIERS.TIER_80,
          vramGb: 80
        })
      );
    });

    it('falls back to safe defaults when metadata is missing', () => {
      const info = getDeviceInfo({ env: {} });
      expect(info).toEqual(
        expect.objectContaining({
          providerLabel: null,
          deviceClass: null,
          gpuCount: 1,
          vramTier: null,
          vramGb: null
        })
      );
    });
  });

  describe('getSlaProfile', () => {
    beforeEach(() => {
      delete process.env.DEFAULT_SLA_PROFILE;
    });

    it('prefers job-level overrides over all other hints', () => {
      const profile = getSlaProfile(
        {
          slaProfile: 'low_latency',
          metadata: { sla: 'high_redundancy' }
        },
        {
          slaProfile: 'trusted_execution',
          tags: ['sla:standard']
        }
      );
      expect(profile).toBe(SLA_PROFILES.LOW_LATENCY_ENCLAVE);
    });

    it('derives profile from tags when direct hints are absent', () => {
      const profile = getSlaProfile(
        {},
        { tags: [' latency', 'SLA:trusted_execution '] }
      );
      expect(profile).toBe(SLA_PROFILES.TRUSTED_EXECUTION);
    });

    it('falls back to environment defaults and STANDARD profile', () => {
      process.env.DEFAULT_SLA_PROFILE = 'high_redundancy';
      const profile = getSlaProfile({}, {});
      expect(profile).toBe(SLA_PROFILES.HIGH_REDUNDANCY);

      delete process.env.DEFAULT_SLA_PROFILE;
      const fallback = getSlaProfile({}, {});
      expect(fallback).toBe(SLA_PROFILES.STANDARD);
    });
  });

  describe('__test__resolveVramTier', () => {
    it('maps VRAM values into canonical tiers', () => {
      expect(__test__resolveVramTier(16)).toBe(VRAM_TIERS.TIER_16);
      expect(__test__resolveVramTier(24)).toBe(VRAM_TIERS.TIER_24);
      expect(__test__resolveVramTier(48)).toBe(VRAM_TIERS.TIER_48);
      expect(__test__resolveVramTier(80)).toBe(VRAM_TIERS.TIER_80);
      expect(__test__resolveVramTier(256)).toBe(VRAM_TIERS.TIER_80);
    });

    it('returns null for invalid inputs', () => {
      expect(__test__resolveVramTier('')).toBeNull();
      expect(__test__resolveVramTier(null)).toBeNull();
      expect(__test__resolveVramTier('NaN')).toBeNull();
    });
  });
});
