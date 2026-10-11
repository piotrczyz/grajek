import type { PushSender } from '../devices/push-sender.js';
import { reminderPayload } from './messages.js';
import type { ReminderRepository } from './repository.js';

export interface ReminderTickDeps {
  repo: ReminderRepository;
  sender: PushSender;
  now: () => Date;
  /** Called with per-device errors; the batch goes on. */
  onError?: (error: unknown) => void;
  batchSize?: number;
  staleMs?: number;
}

export interface ReminderTickResult {
  sent: number;
  skipped: number;
  removed: number;
}

export const DEFAULT_BATCH_SIZE = 200;
export const DEFAULT_STALE_MS = 30 * 60_000;

/**
 * One scheduler pass: claim every due device, then send outside the claim.
 * A claimed reminder is never retried, so delivery is at most once per day.
 */
export async function runReminderTick(deps: ReminderTickDeps): Promise<ReminderTickResult> {
  const { repo, sender } = deps;
  const at = deps.now();
  const staleMs = deps.staleMs ?? DEFAULT_STALE_MS;
  const result: ReminderTickResult = { sent: 0, skipped: 0, removed: 0 };

  const ids = await repo.dueDeviceIds(at, deps.batchSize ?? DEFAULT_BATCH_SIZE);
  for (const id of ids) {
    try {
      const claim = await repo.claim(id, at, staleMs);
      if (!claim.send) {
        result.skipped += 1;
        continue;
      }
      const outcome = await sender.send(claim.subscription, reminderPayload(claim.day));
      if (outcome === 'gone') {
        await repo.delete(id);
        result.removed += 1;
      } else {
        result.sent += 1;
      }
    } catch (error) {
      deps.onError?.(error);
    }
  }
  return result;
}
