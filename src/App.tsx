import { useEffect, useState } from 'react';
import { RETRY_MESSAGE } from './profile/copy.ts';
import { CreateProfileScreen } from './profile/CreateProfileScreen.tsx';
import { ProfileScreen } from './profile/ProfileScreen.tsx';
import { createIndexedDbProfileStore, type Profile, type ProfileStore } from './profile/index.ts';

export { GREETING } from './profile/copy.ts';

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'load-failed' }
  | { kind: 'create' }
  | { kind: 'profile'; profile: Profile };

interface AppProps {
  store?: ProfileStore;
}

export function App({ store: injected }: AppProps = {}) {
  const [store] = useState(() => injected ?? createIndexedDbProfileStore());
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
          {state.kind === 'profile' && <ProfileScreen profile={state.profile} />}
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
        </div>
      )}
    </main>
  );
}
