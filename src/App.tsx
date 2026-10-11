import { useEffect, useState } from 'react';
import { createIndexedDbPracticeStore, type PracticeStore } from './practice/index.ts';
import { RETRY_MESSAGE } from './profile/copy.ts';
import { CreateProfileScreen } from './profile/CreateProfileScreen.tsx';
import { ProfileScreen } from './profile/ProfileScreen.tsx';
import { createIndexedDbPracticeTimeStore, PracticeTimeCard } from './practice-time/index.ts';
import { withReminderSync } from './reminder/index.ts';
import { MonthCard } from './month/index.ts';
import { InstrumentsCard } from './instruments/index.ts';
import { createIndexedDbProfileStore, type Profile, type ProfileStore } from './profile/index.ts';
import { NotificationsPanel } from './push/NotificationsPanel.tsx';

export { GREETING } from './profile/copy.ts';

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'load-failed' }
  | { kind: 'create' }
  | { kind: 'profile'; profile: Profile };

interface AppProps {
  store?: ProfileStore;
  practiceStore?: PracticeStore;
}

export function App({ store: injected, practiceStore: injectedPractice }: AppProps = {}) {
  const [store] = useState(() => injected ?? createIndexedDbProfileStore());
  const [practiceStore] = useState(() => injectedPractice ?? createIndexedDbPracticeStore());
  const [practiceTimeStore] = useState(() => withReminderSync(createIndexedDbPracticeTimeStore()));
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    store.load().then(
      (profile) => {
        if (active) setState(profile ? { kind: 'profile', profile } : { kind: 'create' });
      },
      () => {
        if (active) setState({ kind: 'load-failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [store, attempt]);

  return (
    <main
      className="flex h-full flex-col items-center overflow-y-auto px-6 text-center"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
      }}
    >
      {state.kind !== 'loading' && (
        <div className="m-auto flex w-full flex-col items-center gap-6">
          {state.kind === 'create' && (
            <CreateProfileScreen
              store={store}
              onCreated={(profile) => setState({ kind: 'profile', profile })}
            />
          )}
          {state.kind === 'profile' && (
            <>
              <ProfileScreen profile={state.profile} practiceStore={practiceStore} />
              <PracticeTimeCard store={practiceTimeStore} />
              <MonthCard />
              <InstrumentsCard
                instruments={state.profile.instruments}
                profileStore={store}
                onAdded={(instrument) =>
                  setState((current) =>
                    current.kind === 'profile'
                      ? {
                          kind: 'profile',
                          profile: { ...current.profile, instruments: [...current.profile.instruments, instrument] },
                        }
                      : current,
                  )
                }
              />
            </>
          )}
          {state.kind === 'load-failed' && (
            <>
              <p role="alert" className="max-w-xs text-2xl leading-snug font-semibold">
                {RETRY_MESSAGE}
              </p>
              <button
                type="button"
                onClick={() => {
                  setState({ kind: 'loading' });
                  setAttempt((n) => n + 1);
                }}
                className="min-h-14 rounded-2xl bg-amber-300 px-6 text-2xl font-extrabold text-blue-950"
              >
                Spróbuj jeszcze raz
              </button>
            </>
          )}
          <NotificationsPanel />
        </div>
      )}
    </main>
  );
}
