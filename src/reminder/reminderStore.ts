/**
 * The reminder setting and the last payload the server acknowledged, kept in
 * the existing `device` IndexedDB store (migration v5, out-of-line keys) under
 * the keys `reminderDays` and `reminderSync`. No schema change.
 */
import { DEVICE_STORE } from '../push/device-id.ts';
import { openDb } from '../storage/index.ts';
import { DEFAULT_REMINDER_DAYS, isReminderDays, type ReminderDays, type ReminderPayload } from './reminder.ts';

export const REMINDER_DAYS_KEY = 'reminderDays';
export const REMINDER_SYNC_KEY = 'reminderSync';

/**
 * A payload the server stored, and for which registration: re-enabling
 * notifications creates a fresh server record, so an acknowledgement of an
 * earlier registration no longer counts.
 */
export interface AckedReminder {
  deviceId: string;
  /** `updatedAt` of the registration the payload was sent for. */
  registeredAt: number;
  payload: ReminderPayload;
}

async function read(key: string): Promise<unknown> {
  const db = await openDb();
  try {
    return await db.get(DEVICE_STORE, key);
  } finally {
    db.close();
  }
}

async function write(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await db.put(DEVICE_STORE, value, key);
  } finally {
    db.close();
  }
}

export async function loadReminderDays(): Promise<ReminderDays> {
  const value = await read(REMINDER_DAYS_KEY);
  return isReminderDays(value) ? value : DEFAULT_REMINDER_DAYS;
}

export async function saveReminderDays(days: ReminderDays): Promise<void> {
  await write(REMINDER_DAYS_KEY, days);
}

export async function loadAckedPayload(): Promise<AckedReminder | null> {
  const value = (await read(REMINDER_SYNC_KEY)) as AckedReminder | undefined;
  return value ?? null;
}

export async function saveAckedPayload(ack: AckedReminder): Promise<void> {
  await write(REMINDER_SYNC_KEY, ack);
}
