import { describe, expect, it } from '@jest/globals';

import {
  ACTIVITY_SOURCES,
  TRUST_TIER_FOR_SOURCE,
  trustTierForSource,
  type ActivitySource,
  type TrustTier,
} from './types';

/**
 * The trust tier gates ranked boards and carries a reward multiplier, so it is exactly
 * the field an attacker sets. These tests pin the rule that it is DERIVED, never accepted.
 */
describe('trustTierForSource', () => {
  it('is a total function over every declared source', () => {
    for (const source of ACTIVITY_SOURCES) {
      expect(trustTierForSource(source)).toBeDefined();
    }
    expect(Object.keys(TRUST_TIER_FOR_SOURCE).sort()).toEqual([...ACTIVITY_SOURCES].sort());
  });

  it('never awards DEVICE_VERIFIED to a hand-typed activity', () => {
    expect(trustTierForSource('MANUAL')).toBe('MANUAL');
  });

  it('rates our own live session tracker below platform provenance', () => {
    expect(trustTierForSource('IN_APP')).toBe('APP_TRACKED');
    expect(trustTierForSource('HEALTHKIT')).toBe('DEVICE_VERIFIED');
    expect(trustTierForSource('HEALTH_CONNECT')).toBe('DEVICE_VERIFIED');
  });

  it('only ever yields the two ranked-eligible tiers for platform sources', () => {
    const rankedEligible: TrustTier[] = ['DEVICE_VERIFIED', 'APP_TRACKED'];
    const platform: ActivitySource[] = ['HEALTHKIT', 'HEALTH_CONNECT', 'IN_APP'];
    for (const source of platform) {
      expect(rankedEligible).toContain(trustTierForSource(source));
    }
    expect(rankedEligible).not.toContain(trustTierForSource('MANUAL'));
  });
});
