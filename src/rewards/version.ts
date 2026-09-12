/**
 * The version stamped on every ledger row this package produces.
 *
 * WHY THIS IS ITS OWN ZERO-IMPORT LEAF MODULE, AND NOT A LINE IN `./index.ts`:
 * `apply.ts` needs this value, and the barrel re-exports `apply.ts`. Declaring it in the
 * barrel therefore creates `apply -> index -> apply`. That cycle happens to resolve under
 * CommonJS — TypeScript hoists exported function bindings above the requires — which is
 * exactly what makes it dangerous: it looks harmless in our own test run. Under Metro
 * (React Native) and under a future ESM build, cycle initialisation order differs, and
 * this binding can be read before it is initialised. Every `RewardEntry` would then be
 * stamped `undefined`, silently, IN THE CONSUMER ONLY — an unversioned, unexplainable,
 * un-rescorable row in an append-only store that nobody can ever clean up.
 *
 * A leaf module with no imports of its own cannot participate in a cycle, so the failure
 * mode is designed out rather than tested for. Nothing in `src/rewards` may import the
 * barrel; everything imports this.
 *
 * BUMP ON ANY CHANGE THAT ALTERS REWARD OUTPUT — a tuning constant, a modality mapping, a
 * routing weight, the level curve, a rounding step. NEVER REUSE A VERSION NUMBER: rows
 * from several engine versions coexist in one hero forever, and the only way to explain
 * or re-score an old row is to know precisely which maths produced it.
 *
 * HISTORY — what each version means, because a stamped row is only useful if the number can
 * be resolved back to the maths that produced it:
 *
 *   0.1.0  M0. Activity -> EP -> ledger rows. Intensity fidelity ladder, modality routing,
 *          class bias, daily soft cap and weekly hard cap, level curve, ledger fold.
 *
 *   0.2.0  Two new terms entered the EP formula, so the same activity can now score
 *          differently than it did under 0.1.0 for the same hero:
 *            - SET LOGGING. `SET_LOG_QUALITY_MAX` was reserved-but-unread in 0.1.0 and is now
 *              applied: a set-by-set log of a STRENGTH session earns up to (never including)
 *              a 1.25x multiplier on that session, with diminishing returns. Every other
 *              modality is untouched, and logging nothing still scores exactly as before.
 *            - GEAR. Active item-set bonuses may carry a `modalityConversionBonus`, which
 *              multiplies the conversion of one real training modality. A hero wearing
 *              nothing, or wearing no completed set, scores exactly as before.
 *          A ledger row stamped 0.1.0 was therefore scored WITHOUT either term; re-scoring one
 *          under 0.2.0 requires knowing what the hero was wearing and what sets they logged at
 *          the time, which is why both are stored alongside the activity and not recomputed.
 *          Gear STAT bonuses are deliberately not part of this: they are a combat projection
 *          (see `applyGear`), never a reward multiplier, so they leave the ledger alone.
 *
 *   0.3.0  GEAR BECAME INSTANCED, and the rarity ladder was renamed. The EP formula itself
 *          is UNCHANGED — no ledger row scores differently under 0.3.0 than it did under
 *          0.2.0 — but three things that gear-derived rows depend on moved:
 *            - RARITY RENAME. `COMMON RARE EPIC LEGENDARY MYTHIC` became
 *              `POOR UNCOMMON RARE EPIC LEGENDARY`, a POSITIONAL remap onto the WoW ladder
 *              (gray, green, blue, purple, orange). Every tier kept its weight and its
 *              position; only the names changed. Note the trap this leaves for anyone
 *              reading old data: the string "RARE" means the SECOND tier before 0.3.0 and
 *              the THIRD tier after it. Rarity is not persisted, so there was nothing to
 *              migrate — but a stored value from an external export would be misread.
 *            - ROLLED INSTANCES. A drop is no longer a catalogue entry; it is a `RolledItem`
 *              with its own stat budget, quality in [0.75, 1.00] and seed. Two drops of the
 *              same template now differ, which is what makes an auction house able to
 *              discover a price. Tier budgets deliberately OVERLAP between UNCOMMON, RARE
 *              and EPIC so a good blue can beat a bad purple; POOR and LEGENDARY sit
 *              outside that overlap on purpose.
 *            - FULL SETS BECAME FIVE PIECES, not six, and the weapon slot left every set.
 *              A hero who had all six pieces of a set under 0.2.0 still holds both bonus
 *              tiers under 0.3.0, so no hero loses a bonus; the change only means the
 *              weapon they were wearing no longer counts toward it.
 *
 *   0.10.0   TWO NEW REWARD KINDS: `KEY_DROP` AND `SIGIL_DROP`.
 *
 *            The PVE world arrives, and these two rows are the ENTIRE coupling
 *            between it and training. A key buys one dungeon run; a sigil buys
 *            one attempt at a zone boss. Both are ordinary append-only integer
 *            ledger rows, so a balance folds like everything else and is
 *            re-derivable forever.
 *
 *            NOTHING ALREADY WRITTEN MEANS ANYTHING DIFFERENT. No existing row
 *            changes, no EP formula moved, and no hero's level or stats shift.
 *            This version exists because rows written from 0.10.0 onward can
 *            carry kinds no earlier version could produce — a reader of an old
 *            ledger must be able to know that a missing key row means "this
 *            engine could not grant one", not "this player never earned one".
 *
 *            `rollSessionCurrency` is where they come from: a per-session roll
 *            whose odds taper with effort, on the same anchor as the gear drop,
 *            so a ten-minute walk is not the same lottery ticket as an hour
 *            under the bar. Keys are common by design (a regular trainer always
 *            has a run available); sigils are deliberately scarce.
 *
 *            WHAT THIS VERSION POINTEDLY DOES NOT ADD: any way for PVE to pay
 *            EP or a stat. Training is the only tap; PVE is the sink. That is
 *            not a tuning position, it is the premise of the product.
 *
 *   0.9.0    TRAINING LEADS AGAIN, AND CAN DROP GEAR.
 *
 *            `XP_PER_EP` 1.0 -> 2.0. Real sessions earned 24 to 60 XP while a
 *            duel paid 25 and stamina allowed three a day, so duelling could
 *            out-earn training in a game whose premise is that the training is
 *            the point. A long session is now worth about 120 XP against 75 for
 *            a full day of fighting.
 *
 *            `rollSessionDrop` lets a session drop green, blue or purple. The
 *            chance scales with EP so a ten-minute walk is not the same lottery
 *            ticket as an hour under the bar, and it sits BELOW the combat
 *            rates on purpose: fighting keeps loot as the thing it is best at,
 *            now that XP and gold lean towards training.
 *
 *            EVERY EXISTING HERO'S LEVEL MOVES UP AGAIN, for the same reason as
 *            0.7.0: level is folded from lifetime XP and XP per EP just
 *            doubled. Nothing migrates; the number simply recomputes.
 *
 *   0.8.0    A DUEL WIN ALSO PAYS GOLD. `duelGold` is the XP figure times a
 *            multiplier rather than a second curve — two independent curves for
 *            one event drift the first time either is retuned, leaving a fight
 *            worth good XP and poor gold for no explainable reason. The
 *            five-levels-below cutoff applies to both, because it is the same
 *            zero.
 *
 *   0.7.0    A BANDED LEVEL CURVE, AND TWO SMALLER ECONOMY CHANGES.
 *
 *            The curve was one power law: it charged 120 XP for level 2 — most
 *            of a hard session before anything happened — then flattened, so
 *            30 to 40 cost barely more per level than 20 to 30. Progress felt
 *            slowest exactly where it should have been fastest.
 *
 *            Now ten-level bands, each 30% dearer than the last. Reaching 10 is
 *            about twice as fast as before, 20 a little faster, 30 about the
 *            same, 40 about 30% dearer.
 *
 *            EVERY EXISTING HERO'S LEVEL MOVES, upward, the moment this
 *            deploys. That is safe rather than alarming: level has never been
 *            stored, only folded from lifetime XP, so nothing migrates and
 *            nothing can disagree. It does mean a player opens the app to a
 *            higher number than they left it at.
 *
 *            Also here: `disenchantValue` — breaking an item down for gold,
 *            which is a new gold SOURCE and deliberately worth far less than
 *            selling; and the PvP rematch cooldown became DIRECTIONAL, so being
 *            attacked no longer stops you attacking back.
 *
 *   0.6.0    TALENTS, CLASS BASE STATS AND LEVEL SCALING.
 *
 *            Three things a class did not have before: flat starting stats,
 *            a `dodgePct` to be good or bad at, and fifteen talent trees whose
 *            points move both. Level now scales attack and defence as well as
 *            HP — before this a level-20 hit exactly as hard as a level-1 with
 *            the same stats.
 *
 *            This moves because talents grant STAT bonuses that fold into the
 *            same line trained stats do, so a hero's derived numbers change for
 *            reasons the ledger alone no longer explains. Ledger rows
 *            themselves are unaffected: no reward kind was added, nothing
 *            already written means anything different.
 *
 *   0.5.0    WINNING A DUEL PAYS XP — a new reward SOURCE, which is why this
 *            moves. `duelXp` scales the payout with the level gap: beating
 *            somebody above you pays more, below you pays less, and five levels
 *            below pays exactly nothing.
 *
 *            It is an economy rule doing a job matchmaking used to do. The PvP
 *            level band was removed, so nothing forbids farming a much weaker
 *            hero any more — and a refusal tells somebody they may not play,
 *            where a zero tells them it was not worth playing. The fight stays
 *            available for the reasons that were never about XP.
 *
 *            Before this, battles wrote NO ledger rows at all: the only thing a
 *            win produced was a chance of a gear drop. Rows written from 0.5.0
 *            onward can therefore include `XP` entries attributed to a battle,
 *            which no earlier version could produce.
 */
export const ENGINE_VERSION = '0.10.0';
