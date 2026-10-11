/**
 * Persistence of the student's earned Odznaki and remembered reached goal weeks.
 *
 * Kept in the existing `profile` IndexedDB store (migration v2, out-of-line
 * keys) under the fixed key `badges`, owned by `src/badges/`; no migration is
 * used, and an older build simply ignores the key. The Profile and weekly goal
 * stores never read it. Earned badges are never removed. Nothing here ever
 * leaves the device.
 */
import { createConnection, type OpenConnection } from '../storage/index.ts';
import { validateGoal } from '../weekly-goal/weeklyGoal.ts';
import { evaluateBadges, newlyEarned } from './badgeRules.ts';
import { BADGES, badgeById, type BadgeId } from './catalog.ts';

export interface EarnedBadge {
  id: BadgeId;
  earnedAt: string;
}

export interface BadgeStore {
  /** Every earned badge, in catalog order. */
  list(): Promise<EarnedBadge[]>;
  /** Awards every badge the history now qualifies for; returns the newly earned ones only, in catalog order. */
  award(now?: Date): Promise<EarnedBadge[]>;
}

interface BadgesRecord {
  earned: EarnedBadge[];
  reachedWeeks: string[];
  updatedAt: string;
}

interface PracticeRecord {
  day: string;
  durationMinutes: number;
}

const PRACTICES_STORE = 'practices';
const PROFILE_STORE = 'profile';
const BADGES_KEY = 'badges';
const WEEKLY_GOAL_KEY = 'weeklyGoal';
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const catalogOrder = (a: EarnedBadge, b: EarnedBadge) =>
  BADGES.findIndex((badge) => badge.id === a.id) - BADGES.findIndex((badge) => badge.id === b.id);

/** The usable part of a stored record: malformed entries and unknown ids are dropped, the rest kept. */
function usable(record: unknown): Pick<BadgesRecord, 'earned' | 'reachedWeeks'> {
  const raw = (record && typeof record === 'object' ? record : {}) as Partial<Record<keyof BadgesRecord, unknown>>;
  const earned: EarnedBadge[] = [];
  if (Array.isArray(raw.earned)) {
    for (const entry of raw.earned as unknown[]) {
      if (!entry || typeof entry !== 'object') continue;
      const { id, earnedAt } = entry as Partial<Record<keyof EarnedBadge, unknown>>;
      if (typeof id !== 'string' || typeof earnedAt !== 'string' || !badgeById(id)) continue;
      if (earned.some((badge) => badge.id === id)) continue;
      earned.push({ id: id as BadgeId, earnedAt });
    }
  }
  const weeks = Array.isArray(raw.reachedWeeks) ? (raw.reachedWeeks as unknown[]) : [];
  const reachedWeeks = [
    ...new Set(weeks.filter((week): week is string => typeof week === 'string' && DAY_KEY.test(week))),
  ].sort();
  return { earned: earned.sort(catalogOrder), reachedWeeks };
}

/** The weekly goal as the rules need it, or `null` when none is set or the record is unusable. */
function usableGoal(record: unknown): { daysPerWeek: number; since: string } | null {
  if (!record || typeof record !== 'object') return null;
  const { daysPerWeek, since } = record as { daysPerWeek?: unknown; since?: unknown };
  if (typeof daysPerWeek !== 'number' || !validateGoal(daysPerWeek).ok) return null;
  if (typeof since !== 'string') return null;
  return { daysPerWeek, since };
}

const sameContent = (stored: unknown, clean: Pick<BadgesRecord, 'earned' | 'reachedWeeks'>) => {
  if (!stored || typeof stored !== 'object') return false;
  const { earned, reachedWeeks } = stored as Partial<BadgesRecord>;
  return JSON.stringify({ earned, reachedWeeks }) === JSON.stringify(clean);
};

export function createIndexedDbBadgeStore(open?: OpenConnection, now: () => Date = () => new Date()): BadgeStore {
  // Opens lazily, retries after a failed open, reopens after a version change.
  const db = createConnection(open);

  return {
    async list() {
      return usable(await (await db()).get(PROFILE_STORE, BADGES_KEY)).earned;
    },

    async award(when = now()) {
      // One readwrite transaction: IndexedDB serializes overlapping ones, so a
      // double effect or two tabs never award a badge twice. No other await
      // happens inside it, otherwise it would auto-commit.
      const tx = (await db()).transaction([PRACTICES_STORE, PROFILE_STORE], 'readwrite');
      const profile = tx.objectStore(PROFILE_STORE);
      const [practices, goalRecord, stored] = await Promise.all([
        tx.objectStore(PRACTICES_STORE).getAll() as Promise<PracticeRecord[]>,
        profile.get(WEEKLY_GOAL_KEY),
        profile.get(BADGES_KEY),
      ]);
      const current = usable(stored);
      const { qualifying, reachedWeeks } = evaluateBadges({
        practices,
        goal: usableGoal(goalRecord),
        rememberedWeeks: current.reachedWeeks,
      });
      const earnedAt = when.toISOString();
      const fresh = newlyEarned(
        qualifying,
        current.earned.map((badge) => badge.id),
      ).map((id): EarnedBadge => ({ id, earnedAt }));
      const next = { earned: [...current.earned, ...fresh].sort(catalogOrder), reachedWeeks };

      const unchanged =
        stored === undefined
          ? next.earned.length === 0 && next.reachedWeeks.length === 0
          : sameContent(stored, next);
      if (unchanged) {
        await tx.done;
      } else {
        const record: BadgesRecord = { ...next, updatedAt: earnedAt };
        await Promise.all([profile.put(record, BADGES_KEY), tx.done]);
      }
      return fresh;
    },
  };
}
