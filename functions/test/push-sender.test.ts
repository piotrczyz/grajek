import webpush from 'web-push';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLogSender,
  createWebPushSender,
  shouldUseLogSender,
} from '../src/devices/push-sender.js';
import { TEST_PAYLOAD } from '../src/devices/handler.js';

const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'p256dh', auth: 'auth' },
};
const VAPID = {
  subject: () => 'mailto:dev@example.invalid',
  publicKey: () => 'public',
  privateKey: () => 'private',
};

function pushError(statusCode: number) {
  return new webpush.WebPushError('push failed', statusCode, {}, '', SUBSCRIPTION.endpoint);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createWebPushSender', () => {
  it('sends the JSON payload with the VAPID details and reports sent', async () => {
    const send = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({
      statusCode: 201,
      body: '',
      headers: {},
    });
    await expect(createWebPushSender(VAPID).send(SUBSCRIPTION, TEST_PAYLOAD)).resolves.toBe('sent');
    expect(send).toHaveBeenCalledWith(SUBSCRIPTION, JSON.stringify(TEST_PAYLOAD), {
      vapidDetails: { subject: 'mailto:dev@example.invalid', publicKey: 'public', privateKey: 'private' },
      TTL: 60,
    });
  });

  it.each([404, 410])('maps push service status %i to gone', async (status) => {
    vi.spyOn(webpush, 'sendNotification').mockRejectedValue(pushError(status));
    await expect(createWebPushSender(VAPID).send(SUBSCRIPTION, TEST_PAYLOAD)).resolves.toBe('gone');
  });

  it('rethrows any other failure', async () => {
    vi.spyOn(webpush, 'sendNotification').mockRejectedValue(pushError(500));
    await expect(createWebPushSender(VAPID).send(SUBSCRIPTION, TEST_PAYLOAD)).rejects.toThrow();
  });
});

describe('log sender', () => {
  it('records calls instead of delivering', async () => {
    const sender = createLogSender();
    await expect(sender.send(SUBSCRIPTION, TEST_PAYLOAD)).resolves.toBe('sent');
    expect(sender.calls).toEqual([{ endpoint: SUBSCRIPTION.endpoint, payload: TEST_PAYLOAD }]);
  });

  it('is selected only inside the Functions emulator', () => {
    expect(shouldUseLogSender({ FUNCTIONS_EMULATOR: 'true', PUSH_SENDER: 'log' })).toBe(true);
    expect(shouldUseLogSender({ PUSH_SENDER: 'log' })).toBe(false);
    expect(shouldUseLogSender({ FUNCTIONS_EMULATOR: 'false', PUSH_SENDER: 'log' })).toBe(false);
    expect(shouldUseLogSender({ FUNCTIONS_EMULATOR: 'true' })).toBe(false);
  });
});
