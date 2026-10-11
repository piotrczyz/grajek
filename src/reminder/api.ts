import { apiBase } from '../push/api.ts';
import type { ReminderPayload } from './reminder.ts';

/** Sends the full reminder state; returns the HTTP status (204 = stored). */
export async function putReminder(deviceId: string, payload: ReminderPayload): Promise<number> {
  const response = await fetch(`${apiBase()}/devices/${encodeURIComponent(deviceId)}/reminder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timezone: payload.timezone,
      times: payload.times,
      practicedOn: payload.practicedOn,
    }),
  });
  return response.status;
}
