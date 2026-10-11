import webpush from 'web-push';
import type { PushPayload, PushSubscriptionRecord } from './types.js';

export type SendResult = 'sent' | 'gone';

export interface PushSender {
  /** `'gone'` when the push service says the subscription no longer exists. */
  send(subscription: PushSubscriptionRecord, payload: PushPayload): Promise<SendResult>;
}

export interface VapidConfig {
  /** `mailto:` or `https:` contact for the push services. */
  subject: () => string;
  publicKey: () => string;
  privateKey: () => string;
}

/** Push service statuses meaning "this subscription is gone for good". */
const GONE_STATUSES = new Set([404, 410]);

/** Real Web Push delivery (VAPID). Values are read at send time, not at load. */
export function createWebPushSender(vapid: VapidConfig): PushSender {
  return {
    async send(subscription, payload) {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload), {
          vapidDetails: {
            subject: vapid.subject(),
            publicKey: vapid.publicKey(),
            privateKey: vapid.privateKey(),
          },
          TTL: 60,
        });
        return 'sent';
      } catch (error) {
        if (error instanceof webpush.WebPushError && GONE_STATUSES.has(error.statusCode)) {
          return 'gone';
        }
        throw error;
      }
    },
  };
}

export interface LoggedPush {
  endpoint: string;
  payload: PushPayload;
}

export type LogSender = PushSender & { calls: LoggedPush[] };

/**
 * Records sends instead of delivering them. Used only on the local emulator,
 * which cannot deliver pushes.
 */
export function createLogSender(log: (line: string) => void = () => {}): LogSender {
  const calls: LoggedPush[] = [];
  return {
    calls,
    async send(subscription, payload) {
      calls.push({ endpoint: subscription.endpoint, payload });
      log(`push (log sender): ${payload.tag} -> ${new URL(subscription.endpoint).host}`);
      return 'sent';
    },
  };
}

/** `PUSH_SENDER=log` is honoured only inside the Functions emulator. */
export function shouldUseLogSender(env: Record<string, string | undefined>): boolean {
  return env.FUNCTIONS_EMULATOR === 'true' && env.PUSH_SENDER === 'log';
}

export interface LoggableError {
  name: string;
  message: string;
  statusCode?: number;
  endpointHost?: string;
}

/** Replaces every URL in `text` with its origin, so no per-device path survives. */
function redactUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s"'<>]+/g, (match) => {
    try {
      return new URL(match).origin;
    } catch {
      return '[url]';
    }
  });
}

/**
 * The only shape of an error that may reach the logs (ADR 0001: device data
 * lives in `devices/{id}` only). Never the raw error: a `WebPushError` carries
 * the full device endpoint, the push service headers and the response body.
 */
export function toLoggableError(error: unknown): LoggableError {
  if (!(error instanceof Error)) {
    return { name: 'NonError', message: redactUrls(String(error)) };
  }
  const result: LoggableError = { name: error.name, message: redactUrls(error.message) };
  const { statusCode, endpoint } = error as { statusCode?: unknown; endpoint?: unknown };
  if (typeof statusCode === 'number') {
    result.statusCode = statusCode;
  }
  if (typeof endpoint === 'string') {
    try {
      result.endpointHost = new URL(endpoint).host;
    } catch {
      // Not a URL: drop it rather than log it.
    }
  }
  return result;
}
