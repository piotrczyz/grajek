/**
 * Persistence of the student's single Cel tygodniowy.
 *
 * Kept in the existing `profile` IndexedDB store (migration v2, out-of-line
 * keys) under the fixed key `weeklyGoal`, next to the Profile's `current`
 * record, so no migration is needed. The Profile store never reads this key.
 * Nothing here ever leaves the device.
 */
import { createConnection, type OpenConnection } from '../storage/index.ts';
import { validateGoal, weekStart, type GoalInputReason, type WeeklyGoal } from './weeklyGoal.ts';

export interface WeeklyGoalStore {
  /** The saved goal, or `null` when none is set (or the record is unusable). */
  load(): Promise<WeeklyGoal | null>;
  /** Validates and saves a goal starting this week; clears a declined raise. Rejects with `WeeklyGoalError` `invalid`. */
  setGoal(days: number): Promise<WeeklyGoal>;
  /** Keeps the goal and remembers this week as the week a raise was declined. Rejects with `WeeklyGoalError` `missing`. */
  declineRaise(): Promise<WeeklyGoal>;
}

export type WeeklyGoalErrorCode = 'invalid' | 'missing';

export class WeeklyGoalError extends Error {
  readonly code: WeeklyGoalErrorCode;
  readonly reason?: GoalInputReason;

  constructor(code: WeeklyGoalErrorCode, reason?: GoalInputReason) {
    super(code === 'missing' ? 'No weekly goal is set' : `Invalid weekly goal: ${reason}`);
    this.name = 'WeeklyGoalError';
    this.code = code;
    this.reason = reason;
  }
}

const PROFILE_STORE = 'profile';
const WEEKLY_GOAL_KEY = 'weeklyGoal';

function usable(record: unknown): WeeklyGoal | null {
  if (!record || typeof record !== 'object') return null;
  const goal = record as Partial<WeeklyGoal>;
  if (typeof goal.daysPerWeek !== 'number' || !validateGoal(goal.daysPerWeek).ok) return null;
  if (typeof goal.since !== 'string') return null;
  return goal as WeeklyGoal;
}

export function createIndexedDbWeeklyGoalStore(
  open?: OpenConnection,
  now: () => Date = () => new Date(),
): WeeklyGoalStore {
  const db = createConnection(open);

  return {
    async load() {
      return usable(await (await db()).get(PROFILE_STORE, WEEKLY_GOAL_KEY));
    },

    async setGoal(days) {
      const checked = validateGoal(days);
      if (!checked.ok) throw new WeeklyGoalError('invalid', checked.reason);
      const when = now();
      const record: WeeklyGoal = {
        daysPerWeek: checked.value,
        since: weekStart(when),
        updatedAt: when.toISOString(),
      };
      await (await db()).put(PROFILE_STORE, record, WEEKLY_GOAL_KEY);
      return record;
    },

    async declineRaise() {
      const tx = (await db()).transaction(PROFILE_STORE, 'readwrite');
      const store = tx.objectStore(PROFILE_STORE);
      const current = usable(await store.get(WEEKLY_GOAL_KEY));
      if (!current) {
        tx.abort();
        await tx.done.catch(() => {});
        throw new WeeklyGoalError('missing');
      }
      const when = now();
      const record: WeeklyGoal = {
        ...current,
        raiseDeclinedWeek: weekStart(when),
        updatedAt: when.toISOString(),
      };
      await Promise.all([store.put(record, WEEKLY_GOAL_KEY), tx.done]);
      return record;
    },
  };
}
