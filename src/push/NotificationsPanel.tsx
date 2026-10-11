import { useEffect, useState } from 'react';
import {
  disableNotifications,
  enableNotifications,
  getRegistrationState,
  pushSupport,
  sendTestNotification,
  type PushSupport,
  type TestResult,
} from './push.ts';
import { TEXT } from './panel-text.ts';

const TEST_MESSAGES: Record<TestResult, string> = {
  sent: TEXT.sent,
  cooldown: TEXT.cooldown,
  gone: TEXT.gone,
  error: TEXT.error,
};

const BUTTON =
  'min-h-14 w-full rounded-2xl px-6 py-3 text-xl font-bold shadow-md transition active:scale-95 disabled:opacity-60';

/** Turn reminders on, send a test notification, turn them off (roadmap F-02). */
export function NotificationsPanel() {
  const [support, setSupport] = useState<PushSupport>(() => pushSupport());
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (support !== 'supported') {
      return;
    }
    let active = true;
    getRegistrationState()
      .then((state) => active && setRegistered(state?.registered === true))
      .catch(() => active && setRegistered(false));
    return () => {
      active = false;
    };
  }, [support]);

  if (support === 'unsupported') {
    return null;
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  // Called straight from the tap: iOS asks for permission only on a user gesture.
  const onEnable = () =>
    run(async () => {
      const result = await enableNotifications();
      if (result === 'enabled') {
        setRegistered(true);
        setMessage(TEXT.enabled);
      } else if (result === 'denied') {
        setSupport('denied');
      } else if (result === 'error') {
        setMessage(TEXT.error);
      }
    });

  const onTest = () =>
    run(async () => {
      const result = await sendTestNotification();
      if (result === 'gone') {
        setRegistered(false);
      }
      setMessage(TEST_MESSAGES[result]);
    });

  const onDisable = () =>
    run(async () => {
      const result = await disableNotifications();
      if (result === 'disabled') {
        setRegistered(false);
        setMessage(TEXT.disabled);
      } else {
        setMessage(TEXT.error);
      }
    });

  return (
    <section
      aria-labelledby="notifications-heading"
      className="flex w-full max-w-xs flex-col items-center gap-3"
    >
      <h2 id="notifications-heading" className="text-2xl font-bold">
        {TEXT.heading}
      </h2>
      {support === 'needs-install' && <p className="text-xl leading-snug">{TEXT.needsInstall}</p>}
      {support === 'denied' && <p className="text-xl leading-snug">{TEXT.denied}</p>}
      {support === 'supported' && registered === false && (
        <button
          type="button"
          className={`${BUTTON} bg-amber-300 text-blue-950`}
          disabled={busy}
          onClick={onEnable}
        >
          {TEXT.enable}
        </button>
      )}
      {support === 'supported' && registered === true && (
        <>
          <button
            type="button"
            className={`${BUTTON} bg-amber-300 text-blue-950`}
            disabled={busy}
            onClick={onTest}
          >
            {TEXT.test}
          </button>
          <button
            type="button"
            className={`${BUTTON} border-2 border-amber-300 bg-transparent text-amber-100`}
            disabled={busy}
            onClick={onDisable}
          >
            {TEXT.disable}
          </button>
        </>
      )}
      <p role="status" className="min-h-8 text-xl leading-snug">
        {message}
      </p>
    </section>
  );
}
