/**
 * The anonymous device registration kept on the phone (IndexedDB store
 * `device`, migration v2). The device id is random and is the only thing that
 * identifies this phone to the notification server (ADR 0001).
 */
import { openDb } from '../storage/index.ts';

export const DEVICE_STORE = 'device';
export const REGISTRATION_KEY = 'registration';

export interface RegistrationRecord {
  deviceId: string;
  registered: boolean;
  endpoint?: string;
  updatedAt: number;
}

export async function getRegistrationState(): Promise<RegistrationRecord | null> {
  const db = await openDb();
  try {
    const record = (await db.get(DEVICE_STORE, REGISTRATION_KEY)) as RegistrationRecord | undefined;
    return record ?? null;
  } finally {
    db.close();
  }
}

export async function saveRegistration(record: RegistrationRecord): Promise<void> {
  const db = await openDb();
  try {
    await db.put(DEVICE_STORE, record, REGISTRATION_KEY);
  } finally {
    db.close();
  }
}

/** Returns the stored device id, creating and persisting a new one on first use. */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getRegistrationState();
  if (existing) {
    return existing.deviceId;
  }
  const record: RegistrationRecord = {
    deviceId: crypto.randomUUID(),
    registered: false,
    updatedAt: Date.now(),
  };
  await saveRegistration(record);
  return record.deviceId;
}
