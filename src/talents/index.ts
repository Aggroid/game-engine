/**
 * Public surface of the talent system.
 *
 * Consumed by the backend (which validates and persists a build) and, types
 * plus content, by the mobile app (which renders the trees). The CONTENT is
 * exported because a client has to draw the tree it is asking the server to
 * change — and a client with its own copy of the trees would be a second source
 * of truth for what a talent does.
 */
export {
  SPEC_IDS,
  SPECS_BY_CLASS,
  COMBAT_TARGETS,
  type SpecId,
  type Talent,
  type TalentTree,
  type TalentEffect,
  type TalentAllocation,
  type CombatTarget,
} from './types';
export {
  TALENT_TIER_POINT_STEP,
  TALENT_MAX_TIER,
  CAPSTONE_MAX_RANK,
  STANDARD_MAX_RANK,
  talentPointsForLevel,
} from './constants';
export { TALENT_TREES, TALENTS_BY_ID, TREE_BY_TALENT_ID } from './trees';
export {
  canSpendPoint,
  spendPoint,
  validateAllocation,
  pointsAvailable,
  pointsSpent,
  pointsInTree,
  pointsRequiredForTier,
  treesForClass,
  type SpendDecision,
  type SpendRejection,
} from './allocate';
export {
  talentStatBonus,
  talentCombatModifiers,
  withTalentStats,
  withTalentCombat,
} from './apply';
