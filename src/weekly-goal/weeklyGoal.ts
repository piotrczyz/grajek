/**
 * Rules of the student's Cel tygodniowy: how many days of the Monday-to-Sunday
 * week they want to play, when it is reached, and when to gently offer one
 * more day. One day always stays spare, so a goal of 7 is never possible.
 */
import { dayKey, weekDays } from '../practice/index.ts';

export const GOAL_MAX = 6;
export const GOAL_OPTIONS: readonly number[] = Array.from({ length: GOAL_MAX }, (_, i) => i + 1);
export const DEFAULT_GOAL = 3;
export const SUGGESTED_GOALS: readonly number[] = [3, 4];
/** Reached weeks in a row on the same goal before one more day is offered. */
export const RAISE_AFTER_WEEKS = 3;

export interface WeeklyGoal {
  daysPerWeek: number;
  /** Monday day key (`YYYY-MM-DD`) of the week the goal was last set or changed. */
  since: string;
  /** Monday day key of the week the student last declined a raise. */
  raiseDeclinedWeek?: string;
  updatedAt: string;
}

export type GoalInputReason = 'not-integer' | 'out-of-range';

export type GoalInputResult = { ok: true; value: number } | { ok: false; reason: GoalInputReason };

export function validateGoal(days: number): GoalInputResult {
  if (!Number.isInteger(days)) return { ok: false, reason: 'not-integer' };
  if (days < 1 || days > GOAL_MAX) return { ok: false, reason: 'out-of-range' };
  return { ok: true, value: days };
}

export function isReached(musicDayCount: number, daysPerWeek: number): boolean {
  return musicDayCount >= daysPerWeek;
}

/** Monday day key of the week containing `now`. */
export function weekStart(now: Date): string {
  return weekDays(now)[0];
}

/** Mondays of the `count` completed weeks before the current one, most recent first. */
export function previousWeekStarts(now: Date, count: number): string[] {
  const sinceMonday = (now.getDay() + 6) % 7;
  return Array.from({ length: count }, (_, i) =>
    // Built from local parts so DST changes never shift a week.
    dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday - 7 * (i + 1))),
  );
}

export interface WeekCount {
  /** Monday day key of the week. */
  start: string;
  /** Distinct Dni z muzyką in that week. */
  musicDayCount: number;
}

/**
 * True when one more day may be offered: the goal is below the maximum and the
 * `RAISE_AFTER_WEEKS` completed weeks right before the current one (passed most
 * recent first, as from `previousWeekStarts`) all reached the current goal,
 * all start after the goal was set, and all start after the last declined offer.
 */
export function shouldOfferRaise(goal: WeeklyGoal, recentWeeks: readonly WeekCount[]): boolean {
  if (goal.daysPerWeek >= GOAL_MAX) return false;
  if (recentWeeks.length < RAISE_AFTER_WEEKS) return false;
  return recentWeeks
    .slice(0, RAISE_AFTER_WEEKS)
    .every(
      (week) =>
        isReached(week.musicDayCount, goal.daysPerWeek) &&
        week.start > goal.since &&
        (goal.raiseDeclinedWeek === undefined || week.start > goal.raiseDeclinedWeek),
    );
}
