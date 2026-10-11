/**
 * Grajek notification backend (roadmap F-02, ADR 0001).
 *
 * One HTTPS function `api`, reached same-origin through the Hosting rewrite
 * `/api/**`. It stores anonymous Web Push registrations in Firestore
 * (`devices/{deviceId}`) and can send one test notification per device.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createDevicesHandler } from './devices/handler.js';
import {
  createLogSender,
  createWebPushSender,
  shouldUseLogSender,
  toLoggableError,
  type PushSender,
} from './devices/push-sender.js';
import { createFirestoreRepository } from './devices/repository.js';

const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
const VAPID_PUBLIC_KEY = defineString('VAPID_PUBLIC_KEY', {
  description: 'Public VAPID key (the same value as VITE_VAPID_PUBLIC_KEY in the PWA build).',
});
const VAPID_SUBJECT = defineString('VAPID_SUBJECT', {
  description: 'Contact for push services, a mailto: or https: URL.',
});

if (getApps().length === 0) {
  initializeApp();
}

const sender: PushSender = shouldUseLogSender(process.env)
  ? createLogSender((line) => logger.info(line))
  : createWebPushSender({
      subject: () => VAPID_SUBJECT.value(),
      publicKey: () => VAPID_PUBLIC_KEY.value(),
      privateKey: () => VAPID_PRIVATE_KEY.value(),
    });

const handler = createDevicesHandler({
  repo: createFirestoreRepository(getFirestore()),
  sender,
  now: () => new Date(),
  onError: (error) => logger.error('devices api error', toLoggableError(error)),
});

export const api = onRequest(
  {
    region: 'europe-central2',
    secrets: [VAPID_PRIVATE_KEY],
    cors: false,
    maxInstances: 2,
  },
  handler,
);
