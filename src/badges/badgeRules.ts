/**
 * Pure evaluation of which Odznaki the practice history qualifies for.
 *
 * Awarding is recomputation, not event counting: every evaluation derives all
 * qualifying badges from the full history plus the remembered reached weeks,
 * so it is idempotent and catches up anything missed. Reached weeks are
 * remembered by the caller because the goal's `since` moves on every goal
 * change and would otherwise drop earlier reached weeks.
 */
import { isReached, weekStart } from '../weekly-goal/weeklyGoal.ts';
import { BADGES, type BadgeDefinition, type BadgeId } from './catalog.ts';

export interface BadgeInput {
  practices: readonly { day: string; durationMinutes: number }[];
  goal: { daysPerWeek: number; since: string } | null;
  rememberedWeeks: readonly string[];
}

export interface BadgeEvaluation {
  /** Every badge the history qualifies for, in catalog order. */
  qualifying: BadgeId[];
  /** Monday day keys of every reached goal week (remembered ones included), sorted. */
  reachedWeeks: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parts(day: string): [number, number, number] {
  const [year, month, date] = day.split('-').map(Number);
  return [year, month, date];
}

/** Monday day key of the week containing the day key `day`; built from local parts, DST-safe. */
export function mondayOf(day: string): string {
  const [year, month, date] = parts(day);
  return weekStart(new Date(year, month - 1, date));
}

/** Whole calendar days from `a` to `b` (day keys); UTC arithmetic so DST never shifts it. */
function dayDifference(a: string, b: string): number {
  const [ya, ma, da] = parts(a);
  const [yb, mb, db] = parts(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY_MS);
}

function longestGap(sortedDays: readonly string[]): number {
  let longest = 0;
  for (let i = 1; i < sortedDays.length; i += 1) {
    longest = Math.max(longest, dayDifference(sortedDays[i - 1], sortedDays[i]));
  }
  return longest;
}

function reachedWeeksOf(input: BadgeInput, days: readonly string[]): string[] {
  const weeks = new Set(input.rememberedWeeks);
  const goal = input.goal;
  if (goal) {
    const daysPerWeek = new Map<string, number>();
    for (const day of days) {
      const monday = mondayOf(day);
      daysPerWeek.set(monday, (daysPerWeek.get(monday) ?? 0) + 1);
    }
    for (const [monday, count] of daysPerWeek) {
      if (monday >= goal.since && isReached(count, goal.daysPerWeek)) weeks.add(monday);
    }
  }
  return [...weeks].sort();
}

export function evaluateBadges(input: BadgeInput): BadgeEvaluation {
  const days = [...new Set(input.practices.map((practice) => practice.day))].sort();
  const minutes = input.practices.reduce((sum, practice) => sum + practice.durationMinutes, 0);
  const reachedWeeks = reachedWeeksOf(input, days);
  const gap = longestGap(days);

  const measure: Record<BadgeDefinition['kind'], number> = {
    days: days.length,
    time: minutes,
    weeks: reachedWeeks.length,
    comeback: gap,
  };
  const qualifying = BADGES.filter((badge) => measure[badge.kind] >= badge.threshold).map((badge) => badge.id);
  return { qualifying, reachedWeeks };
}

/** Qualifying badges not earned yet, in catalog order. */
export function newlyEarned(qualifying: readonly BadgeId[], earned: readonly BadgeId[]): BadgeId[] {
  const have = new Set(earned);
  const wanted = new Set(qualifying);
  return BADGES.filter((badge) => wanted.has(badge.id) && !have.has(badge.id)).map((badge) => badge.id);
}
