import { useEffect, useState } from 'react';
import { LOG_BUTTON, SAVED_MESSAGE } from '../practice/copy.ts';
import { LogPractice } from '../practice/LogPractice.tsx';
import { DEFAULT_DURATION, type PracticeStore } from '../practice/practiceStore.ts';
import { instrumentIcon } from './instruments.ts';
import type { Profile } from './profileStore.ts';

interface ProfileScreenProps {
  profile: Profile;
  practiceStore: PracticeStore;
}

/** The home screen: greeting, instrument, and logging a practice session. */
export function ProfileScreen({ profile, practiceStore }: ProfileScreenProps) {
  const [logging, setLogging] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lastDuration, setLastDuration] = useState(DEFAULT_DURATION);

  useEffect(() => {
    let active = true;
    practiceStore.lastDuration().then(
      (minutes) => {
        if (active && minutes !== null) setLastDuration(minutes);
      },
      () => {
        // Keep the default duration; logging still works.
      },
    );
    return () => {
      active = false;
    };
  }, [practiceStore]);

  return (
    <>
      <h1 className="text-5xl font-extrabold tracking-tight break-words">Cześć, {profile.name}!</h1>
      <p className="flex flex-col items-center gap-2 text-3xl font-semibold">
        <span aria-hidden="true" className="text-8xl">
          {instrumentIcon(profile.instrument.name)}
        </span>
        <span>{profile.instrument.name}</span>
      </p>
      {logging ? (
        <LogPractice
          store={practiceStore}
          instrumentId={profile.instrument.id}
          initialDuration={lastDuration}
          onSaved={(practice) => {
            setLastDuration(practice.durationMinutes);
            setLogging(false);
            setSaved(true);
          }}
          onCancel={() => setLogging(false)}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              setSaved(false);
              setLogging(true);
            }}
            className="min-h-20 w-full max-w-sm rounded-3xl bg-amber-300 px-6 text-4xl font-extrabold text-blue-950"
          >
            {LOG_BUTTON}
          </button>
          <p role="status" className="min-h-8 text-2xl font-bold text-amber-300">
            {saved ? SAVED_MESSAGE : null}
          </p>
        </>
      )}
    </>
  );
}
