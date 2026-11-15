/**
 * Grajek notification backend (roadmap F-02, ADR 0001).
 *
 * One HTTPS function `api`, reached same-origin through the Hosting rewrite
 * `/api/**`. It stores anonymous Web Push registrations in Firestore
 * (`devices/{deviceId}`), can send one test notification per device and
 * stores each device's daily reminder state (roadmap S-08).
 *
 * One scheduled function `reminders` runs every 5 minutes and sends the due
 * daily reminders, at most one per device per local day.
 *
 * `api` also takes the anonymous attempt records (with the automatic
 * recognition estimate) of the hidden "Zagraj i sprawdź" spike screen (`/api/spike-nuty/...`,
 * Firestore `spikeNutyAttempts`, 180-day TTL).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createApiHandler } from './api-router.js';
import { createDevicesHandler } from './devices/handler.js';
import {
  createLogSender,
  createWebPushSender,
  shouldUseLogSender,
  toLoggableError,
  type PushSender,
} from './devices/push-sender.js';
import { createFirestoreRepository } from './devices/repository.js';
import { createFirestoreReminderRepository } from './reminders/repository.js';
import { runReminderTick } from './reminders/tick.js';
import { createSpikeNutyHandler } from './spike-nuty/handler.js';
import { createFirestoreSpikeNutyRepository } from './spike-nuty/repository.js';

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

const devicesHandler = createDevicesHandler({
  repo: createFirestoreRepository(getFirestore()),
  sender,
  now: () => new Date(),
  onError: (error) => logger.error('devices api error', toLoggableError(error)),
});

const spikeNutyHandler = createSpikeNutyHandler({
  repo: createFirestoreSpikeNutyRepository(getFirestore()),
  now: () => new Date(),
  onError: (error) => logger.error('spike-nuty api error', toLoggableError(error)),
});

const handler = createApiHandler({ devices: devicesHandler, spikeNuty: spikeNutyHandler });

export const api = onRequest(
  {
    region: 'europe-central2',
    secrets: [VAPID_PRIVATE_KEY],
    cors: false,
    maxInstances: 2,
  },
  handler,
);

export const reminders = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Etc/UTC',
    region: 'europe-central2',
    secrets: [VAPID_PRIVATE_KEY],
    maxInstances: 1,
    retryCount: 0,
  },
  async () => {
    const result = await runReminderTick({
      repo: createFirestoreReminderRepository(getFirestore()),
      sender,
      now: () => new Date(),
      onError: (error) => logger.error('reminders tick error', toLoggableError(error)),
    });
    logger.info('reminders tick', result);
  },
);
