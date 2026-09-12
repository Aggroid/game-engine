import type { HeroClass } from '../contracts/types';
import { CAPSTONE_MAX_RANK, STANDARD_MAX_RANK } from './constants';
import type { SpecId, Talent, TalentTree } from './types';

/**
 * The fifteen trees.
 *
 * ============================================================================
 * EVERY TREE HAS THE SAME SHAPE, AND THAT IS ON PURPOSE.
 * ============================================================================
 *   tier 1   two talents, three ranks each    (6 points fills it)
 *   tier 2   two talents, three ranks each    (opens at 5 in this tree)
 *   tier 3   one capstone, one rank           (opens at 10 in this tree)
 *
 * A uniform shape means a player can read a tree they have never seen, and it
 * means balance is comparing like with like. WoW's trees are far wider; the
 * width there buys flavour that this game has no room for yet, and a wide tree
 * full of near-identical +1% nodes is the failure mode to avoid, not the model.
 *
 * WHAT MAKES THE SPECS DIFFERENT is which numbers they move, not how many:
 *
 *   defensive specs   hp, defence, dodge
 *   weapon specs      attack, crit
 *   burst specs       crit and crit-adjacent, at a cost
 *   sustain specs     regen, stamina
 *
 * Each class's three trees deliberately cover a defensive, an offensive and a
 * third axis particular to the class, so no class is forced into one answer.
 *
 * SPELL EFFECTS ARE DECLARED AND INERT. Spells are a later version; the
 * modifiers are written now so the content reads as designed and so switching
 * them on is adding a mechanic rather than rewriting fifteen trees.
 */

/** Two three-rank talents, then two more, then a capstone. */
function tree(
  id: SpecId,
  heroClass: HeroClass,
  name: string,
  summary: string,
  talents: readonly Talent[],
): TalentTree {
  return { id, heroClass, name, summary, talents };
}

function t(
  id: string,
  tier: number,
  name: string,
  description: string,
  effects: Talent['effects'],
  maxRank: number = STANDARD_MAX_RANK,
): Talent {
  return { id, name, description, tier, maxRank, effects };
}

/* -------------------------------------------------------------------------- *
 * WARRIOR — strength. Protection / Arms / Fury
 * -------------------------------------------------------------------------- */

const PROTECTION = tree(
  'protection',
  'WARRIOR',
  'Protection',
  'Absorbs everything and outlasts it. The hardest hero to kill.',
  [
    t('prot_toughness', 1, 'Toughness', 'Hard training thickens the hide. +4% HP per rank.', [
      { kind: 'COMBAT_PCT', target: 'hp', perRank: 4 },
    ]),
    t('prot_bulwark', 1, 'Bulwark', 'Meet the blow rather than take it. +2 defence per rank.', [
      { kind: 'COMBAT_FLAT', target: 'defence', perRank: 2 },
    ]),
    t('prot_footwork', 2, 'Footwork', 'Heavy does not mean slow. +2% dodge per rank.', [
      { kind: 'COMBAT_PCT', target: 'dodgePct', perRank: 2 },
    ]),
    t('prot_conditioning', 2, 'Conditioning', 'Carry the weight longer. +3 VIT per rank.', [
      { kind: 'STAT', stat: 'vit', perRank: 3 },
    ]),
    t(
      'prot_last_stand',
      3,
      'Last Stand',
      'The lower you fall, the harder you hold. +12% HP and +4 defence.',
      [
        { kind: 'COMBAT_PCT', target: 'hp', perRank: 12 },
        { kind: 'COMBAT_FLAT', target: 'defence', perRank: 4 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

const ARMS = tree(
  'arms',
  'WARRIOR',
  'Arms',
  'One weapon, swung properly. Clean, heavy, repeatable damage.',
  [
    t('arms_technique', 1, 'Technique', 'Form beats effort. +4% attack per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 4 },
    ]),
    t('arms_heavy_hands', 1, 'Heavy Hands', 'Load the bar. +3 STR per rank.', [
      { kind: 'STAT', stat: 'str', perRank: 3 },
    ]),
    t('arms_openings', 2, 'Openings', 'Read the gap before it appears. +1.5% crit per rank.', [
      { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 1.5 },
    ]),
    t('arms_momentum', 2, 'Momentum', 'The second swing is the dangerous one. +4% attack per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 4 },
    ]),
    t(
      'arms_mortal_strike',
      3,
      'Mortal Strike',
      'One committed blow. +10% attack and +4% crit.',
      [
        { kind: 'COMBAT_PCT', target: 'attack', perRank: 10 },
        { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 4 },
        { kind: 'SPELL', spellId: 'mortal_strike', note: 'Wounds reduce enemy regen.', perRank: 1 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

const FURY = tree(
  'fury',
  'WARRIOR',
  'Fury',
  'Trades safety for speed. Wins fast or not at all.',
  [
    t('fury_frenzy', 1, 'Frenzy', 'Swing before you think. +2% crit per rank.', [
      { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 2 },
    ]),
    t('fury_bloodthirst', 1, 'Bloodthirst', 'The fight feeds you. +2 regen per rank.', [
      { kind: 'COMBAT_FLAT', target: 'regen', perRank: 2 },
    ]),
    t('fury_reckless', 2, 'Recklessness', 'Guard down, hands up. +6% attack, -2% HP per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 6 },
      { kind: 'COMBAT_PCT', target: 'hp', perRank: -2 },
    ]),
    t('fury_endurance', 2, 'Endurance', 'More fights in a day. +1 stamina per rank.', [
      { kind: 'COMBAT_FLAT', target: 'stamina', perRank: 1 },
    ]),
    t(
      'fury_rampage',
      3,
      'Rampage',
      'Every hit builds the next. +6% crit and +8% attack.',
      [
        { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 6 },
        { kind: 'COMBAT_PCT', target: 'attack', perRank: 8 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

/* -------------------------------------------------------------------------- *
 * MAGE — swim and mobility. Fire / Frost / Lightning
 * -------------------------------------------------------------------------- */

const FIRE = tree(
  'fire',
  'MAGE',
  'Fire',
  'Burst damage that escalates. Highest ceiling, least safety.',
  [
    t('fire_kindling', 1, 'Kindling', 'Heat builds with focus. +3 FOC per rank.', [
      { kind: 'STAT', stat: 'foc', perRank: 3 },
    ]),
    t('fire_ignite', 1, 'Ignite', 'Leave them burning. +4% attack per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 4 },
    ]),
    t('fire_critical_mass', 2, 'Critical Mass', 'Fire finds the seam. +2% crit per rank.', [
      { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 2 },
    ]),
    t('fire_combustion', 2, 'Combustion', 'All of it, at once. +5% attack per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 5 },
    ]),
    t(
      'fire_pyroblast',
      3,
      'Pyroblast',
      'The long cast that ends it. +12% attack and +5% crit.',
      [
        { kind: 'COMBAT_PCT', target: 'attack', perRank: 12 },
        { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 5 },
        { kind: 'SPELL', spellId: 'pyroblast', note: 'A heavy opening strike.', perRank: 1 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

const FROST = tree(
  'frost',
  'MAGE',
  'Frost',
  'Slows the fight down and survives it. The patient mage.',
  [
    t('frost_frozen_skin', 1, 'Frozen Skin', 'Cold armour. +3 defence per rank.', [
      { kind: 'COMBAT_FLAT', target: 'defence', perRank: 3 },
    ]),
    t('frost_clarity', 1, 'Clarity', 'Cold thinking. +3 FOC per rank.', [
      { kind: 'STAT', stat: 'foc', perRank: 3 },
    ]),
    t('frost_glacial', 2, 'Glacial Armour', 'Nothing lands cleanly. +2% dodge per rank.', [
      { kind: 'COMBAT_PCT', target: 'dodgePct', perRank: 2 },
    ]),
    t('frost_permafrost', 2, 'Permafrost', 'Outlast the burn. +4% HP per rank.', [
      { kind: 'COMBAT_PCT', target: 'hp', perRank: 4 },
    ]),
    t(
      'frost_deep_freeze',
      3,
      'Deep Freeze',
      'Stop them entirely. +8% defence, +5% dodge.',
      [
        { kind: 'COMBAT_PCT', target: 'defence', perRank: 8 },
        { kind: 'COMBAT_PCT', target: 'dodgePct', perRank: 5 },
        { kind: 'SPELL', spellId: 'deep_freeze', note: 'The enemy loses a turn.', perRank: 1 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

const LIGHTNING = tree(
  'lightning',
  'MAGE',
  'Lightning',
  'Fast, repeating hits. Consistency over spikes.',
  [
    t('light_static', 1, 'Static', 'Charge builds as you move. +2% crit per rank.', [
      { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 2 },
    ]),
    t('light_conduction', 1, 'Conduction', 'Energy flows further. +3 AGI per rank.', [
      { kind: 'STAT', stat: 'agi', perRank: 3 },
    ]),
    t('light_chain', 2, 'Chain Lightning', 'It jumps. +4% attack per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 4 },
    ]),
    t('light_overload', 2, 'Overload', 'More charges per session. +1 stamina per rank.', [
      { kind: 'COMBAT_FLAT', target: 'stamina', perRank: 1 },
    ]),
    t(
      'light_storm',
      3,
      'Storm',
      'Continuous discharge. +7% crit and +6% attack.',
      [
        { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 7 },
        { kind: 'COMBAT_PCT', target: 'attack', perRank: 6 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

/* -------------------------------------------------------------------------- *
 * ROGUE (Hunter) — high-intensity cardio. Beast / Archer / Attacker
 * -------------------------------------------------------------------------- */

const BEAST = tree(
  'beast',
  'ROGUE',
  'Beast',
  'Fights alongside something. Sustain and pressure.',
  [
    t('beast_bond', 1, 'Bond', 'The animal takes a share. +2 regen per rank.', [
      { kind: 'COMBAT_FLAT', target: 'regen', perRank: 2 },
    ]),
    t('beast_pack', 1, 'Pack Health', 'Both of you are tougher. +4% HP per rank.', [
      { kind: 'COMBAT_PCT', target: 'hp', perRank: 4 },
    ]),
    t('beast_ferocity', 2, 'Ferocity', 'It goes first, and it goes hard. +4% attack per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 4 },
    ]),
    t('beast_spirit_link', 2, 'Spirit Link', 'Shared wind. +3 SPI per rank.', [
      { kind: 'STAT', stat: 'spi', perRank: 3 },
    ]),
    t(
      'beast_unleash',
      3,
      'Unleash',
      'Both of you, all at once. +10% attack and +4 regen.',
      [
        { kind: 'COMBAT_PCT', target: 'attack', perRank: 10 },
        { kind: 'COMBAT_FLAT', target: 'regen', perRank: 4 },
        { kind: 'SPELL', spellId: 'unleash', note: 'The companion strikes each turn.', perRank: 1 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

const ARCHER = tree(
  'archer',
  'ROGUE',
  'Archer',
  'Precision at range. Crits, and crits again.',
  [
    t('archer_aim', 1, 'Aim', 'Steady hands. +2% crit per rank.', [
      { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 2 },
    ]),
    t('archer_draw', 1, 'Draw Strength', 'A heavier pull. +3 AGI per rank.', [
      { kind: 'STAT', stat: 'agi', perRank: 3 },
    ]),
    t('archer_focus_fire', 2, 'Focus Fire', 'Same spot, every time. +4% attack per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 4 },
    ]),
    t('archer_evasion', 2, 'Evasion', 'Never where they aimed. +2% dodge per rank.', [
      { kind: 'COMBAT_PCT', target: 'dodgePct', perRank: 2 },
    ]),
    t(
      'archer_killshot',
      3,
      'Kill Shot',
      'The one that finishes it. +8% crit and +8% attack.',
      [
        { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 8 },
        { kind: 'COMBAT_PCT', target: 'attack', perRank: 8 },
        { kind: 'SPELL', spellId: 'kill_shot', note: 'Far heavier below half health.', perRank: 1 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

const ATTACKER = tree(
  'attacker',
  'ROGUE',
  'Attacker',
  'Close, fast and evasive. Never takes a clean hit.',
  [
    t('atk_quickness', 1, 'Quickness', 'First to move. +2% dodge per rank.', [
      { kind: 'COMBAT_PCT', target: 'dodgePct', perRank: 2 },
    ]),
    t('atk_edge', 1, 'Edge', 'Sharper every session. +4% attack per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 4 },
    ]),
    t('atk_footwork', 2, 'Footwork', 'Out of reach. +3 AGI per rank.', [
      { kind: 'STAT', stat: 'agi', perRank: 3 },
    ]),
    t('atk_relentless', 2, 'Relentless', 'Keep going. +1 stamina per rank.', [
      { kind: 'COMBAT_FLAT', target: 'stamina', perRank: 1 },
    ]),
    t(
      'atk_ambush',
      3,
      'Ambush',
      'Decide it in the first exchange. +10% crit and +6% dodge.',
      [
        { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 10 },
        { kind: 'COMBAT_PCT', target: 'dodgePct', perRank: 6 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

/* -------------------------------------------------------------------------- *
 * PRIEST — recovery. Spirit / Shadow / Darkness
 * -------------------------------------------------------------------------- */

const SPIRIT = tree(
  'spirit',
  'PRIEST',
  'Spirit',
  'Recovers faster than anything can wear it down.',
  [
    t('spirit_renewal', 1, 'Renewal', 'Rest counts. +2 regen per rank.', [
      { kind: 'COMBAT_FLAT', target: 'regen', perRank: 2 },
    ]),
    t('spirit_inner_calm', 1, 'Inner Calm', 'Nothing rushes you. +3 SPI per rank.', [
      { kind: 'STAT', stat: 'spi', perRank: 3 },
    ]),
    t('spirit_mending', 2, 'Mending', 'Between the blows. +2 regen per rank.', [
      { kind: 'COMBAT_FLAT', target: 'regen', perRank: 2 },
    ]),
    t('spirit_vitality', 2, 'Vitality', 'Deeper reserves. +4% HP per rank.', [
      { kind: 'COMBAT_PCT', target: 'hp', perRank: 4 },
    ]),
    t(
      'spirit_rebirth',
      3,
      'Rebirth',
      'Come back from almost nothing. +6 regen and +10% HP.',
      [
        { kind: 'COMBAT_FLAT', target: 'regen', perRank: 6 },
        { kind: 'COMBAT_PCT', target: 'hp', perRank: 10 },
        { kind: 'SPELL', spellId: 'rebirth', note: 'Heals hugely once per fight.', perRank: 1 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

const SHADOW = tree(
  'shadow',
  'PRIEST',
  'Shadow',
  'Turns recovery into pressure. Damage that sustains itself.',
  [
    t('shadow_siphon', 1, 'Siphon', 'Take what they spend. +3% attack per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 3 },
    ]),
    t('shadow_focus', 1, 'Shadow Focus', 'Quiet concentration. +3 FOC per rank.', [
      { kind: 'STAT', stat: 'foc', perRank: 3 },
    ]),
    t('shadow_drain', 2, 'Drain', 'Their loss is your gain. +2 regen per rank.', [
      { kind: 'COMBAT_FLAT', target: 'regen', perRank: 2 },
    ]),
    t('shadow_malice', 2, 'Malice', 'Find the weak point. +2% crit per rank.', [
      { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 2 },
    ]),
    t(
      'shadow_devour',
      3,
      'Devour',
      'Every hit feeds you. +10% attack and +5 regen.',
      [
        { kind: 'COMBAT_PCT', target: 'attack', perRank: 10 },
        { kind: 'COMBAT_FLAT', target: 'regen', perRank: 5 },
        { kind: 'SPELL', spellId: 'devour', note: 'Damage dealt returns as health.', perRank: 1 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

const DARKNESS = tree(
  'darkness',
  'PRIEST',
  'Darkness',
  'Unsettling and hard to pin down. Avoidance over armour.',
  [
    t('dark_veil', 1, 'Veil', 'Hard to see, harder to hit. +2% dodge per rank.', [
      { kind: 'COMBAT_PCT', target: 'dodgePct', perRank: 2 },
    ]),
    t('dark_dread', 1, 'Dread', 'They swing early. +2 defence per rank.', [
      { kind: 'COMBAT_FLAT', target: 'defence', perRank: 2 },
    ]),
    t('dark_whispers', 2, 'Whispers', 'Doubt costs them. +3% attack per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 3 },
    ]),
    t('dark_endurance', 2, 'Night Endurance', 'Long after they tire. +3 END per rank.', [
      { kind: 'STAT', stat: 'end', perRank: 3 },
    ]),
    t(
      'dark_eclipse',
      3,
      'Eclipse',
      'Nothing lands at all. +8% dodge and +6% defence.',
      [
        { kind: 'COMBAT_PCT', target: 'dodgePct', perRank: 8 },
        { kind: 'COMBAT_PCT', target: 'defence', perRank: 6 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

/* -------------------------------------------------------------------------- *
 * PALADIN — variety. Holy / Protection / Fighter
 * -------------------------------------------------------------------------- */

const HOLY = tree(
  'holy',
  'PALADIN',
  'Holy',
  'Sustains through anything. The long fight specialist.',
  [
    t('holy_light', 1, 'Light', 'Steady restoration. +2 regen per rank.', [
      { kind: 'COMBAT_FLAT', target: 'regen', perRank: 2 },
    ]),
    t('holy_devotion', 1, 'Devotion', 'Balanced and unbroken. +3 VIT per rank.', [
      { kind: 'STAT', stat: 'vit', perRank: 3 },
    ]),
    t('holy_grace', 2, 'Grace', 'Carried through. +4% HP per rank.', [
      { kind: 'COMBAT_PCT', target: 'hp', perRank: 4 },
    ]),
    t('holy_conviction', 2, 'Conviction', 'Belief hits back. +3% attack per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 3 },
    ]),
    t(
      'holy_lay_on_hands',
      3,
      'Lay on Hands',
      'One full restoration. +6 regen and +12% HP.',
      [
        { kind: 'COMBAT_FLAT', target: 'regen', perRank: 6 },
        { kind: 'COMBAT_PCT', target: 'hp', perRank: 12 },
        { kind: 'SPELL', spellId: 'lay_on_hands', note: 'A single large heal.', perRank: 1 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

const PALADIN_PROTECTION = tree(
  'paladin_protection',
  'PALADIN',
  'Protection',
  'Shields and holds. Defence without giving up damage.',
  [
    t('pprot_shield', 1, 'Shield', 'Take it on the plate. +3 defence per rank.', [
      { kind: 'COMBAT_FLAT', target: 'defence', perRank: 3 },
    ]),
    t('pprot_stout', 1, 'Stoutness', 'Built wide. +4% HP per rank.', [
      { kind: 'COMBAT_PCT', target: 'hp', perRank: 4 },
    ]),
    t('pprot_deflect', 2, 'Deflect', 'Turn it aside. +2% dodge per rank.', [
      { kind: 'COMBAT_PCT', target: 'dodgePct', perRank: 2 },
    ]),
    t('pprot_retaliate', 2, 'Retaliate', 'Answer every blow. +3% attack per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 3 },
    ]),
    t(
      'pprot_aegis',
      3,
      'Aegis',
      'Immovable. +10% defence, +8% HP and +3% dodge.',
      [
        { kind: 'COMBAT_PCT', target: 'defence', perRank: 10 },
        { kind: 'COMBAT_PCT', target: 'hp', perRank: 8 },
        { kind: 'COMBAT_PCT', target: 'dodgePct', perRank: 3 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

const FIGHTER = tree(
  'fighter',
  'PALADIN',
  'Fighter',
  'Straight damage from a hero with no weak side.',
  [
    t('fight_strength', 1, 'Strength of Arms', 'Plain power. +3 STR per rank.', [
      { kind: 'STAT', stat: 'str', perRank: 3 },
    ]),
    t('fight_zeal', 1, 'Zeal', 'Faster than the armour suggests. +2% crit per rank.', [
      { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 2 },
    ]),
    t('fight_crusade', 2, 'Crusade', 'Forward, always. +4% attack per rank.', [
      { kind: 'COMBAT_PCT', target: 'attack', perRank: 4 },
    ]),
    t('fight_vigour', 2, 'Vigour', 'More of everything. +1 stamina per rank.', [
      { kind: 'COMBAT_FLAT', target: 'stamina', perRank: 1 },
    ]),
    t(
      'fight_judgement',
      3,
      'Judgement',
      'Decisive and heavy. +10% attack and +5% crit.',
      [
        { kind: 'COMBAT_PCT', target: 'attack', perRank: 10 },
        { kind: 'COMBAT_FLAT', target: 'critPct', perRank: 5 },
        { kind: 'SPELL', spellId: 'judgement', note: 'A heavy finishing blow.', perRank: 1 },
      ],
      CAPSTONE_MAX_RANK,
    ),
  ],
);

/** Every tree, by spec id. */
export const TALENT_TREES: Record<SpecId, TalentTree> = {
  protection: PROTECTION,
  arms: ARMS,
  fury: FURY,
  fire: FIRE,
  frost: FROST,
  lightning: LIGHTNING,
  beast: BEAST,
  archer: ARCHER,
  attacker: ATTACKER,
  spirit: SPIRIT,
  shadow: SHADOW,
  darkness: DARKNESS,
  holy: HOLY,
  paladin_protection: PALADIN_PROTECTION,
  fighter: FIGHTER,
};

/** Every talent in the game, by id. Built once; nothing else may index by hand. */
export const TALENTS_BY_ID: Record<string, Talent> = Object.fromEntries(
  Object.values(TALENT_TREES).flatMap((current) =>
    current.talents.map((talent) => [talent.id, talent] as const),
  ),
);

/** Which tree a talent belongs to. */
export const TREE_BY_TALENT_ID: Record<string, TalentTree> = Object.fromEntries(
  Object.values(TALENT_TREES).flatMap((current) =>
    current.talents.map((talent) => [talent.id, current] as const),
  ),
);
