// Transport of the spike telemetry: same-origin `/api` like the push client.
// Each call returns the HTTP status and throws only on a network error.
import { apiBase } from '../../push/api.ts';

function attemptUrl(attemptId: string, suffix = ''): string {
  return `${apiBase()}/spike-nuty/attempts/${encodeURIComponent(attemptId)}${suffix}`;
}

async function put(url: string, body: unknown): Promise<number> {
  // No keepalive: the browser caps keepalive bodies at 64 KiB and a record may be larger.
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.status;
}

export function putAttempt(attemptId: string, body: unknown): Promise<number> {
  return put(attemptUrl(attemptId), body);
}

export function putFeedback(attemptId: string, body: unknown): Promise<number> {
  return put(attemptUrl(attemptId, '/feedback'), body);
}
