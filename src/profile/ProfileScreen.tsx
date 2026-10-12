import { useEffect, useState } from 'react';
import { BadgesCard } from '../badges/index.ts';
import { backdatedMessage, LOG_BUTTON, SAVED_MESSAGE } from '../practice/copy.ts';
import { LogPractice } from '../practice/LogPractice.tsx';
import { DEFAULT_DURATION, type PracticeStore } from '../practice/practiceStore.ts';
import { dayKey, weekDays } from '../practice/week.ts';
import { WeekView } from '../practice/WeekView.tsx';
import { ShareCardButton } from '../progress-card/index.ts';
import { WeeklyGoalCard } from '../weekly-goal/WeeklyGoalCard.tsx';
import { instrumentIcon } from './instruments.ts';
import type { Profile } from './profileStore.ts';

interface ProfileScreenProps {
  profile: Profile;
  practiceStore: PracticeStore;
}

/**
 * The home screen: greeting, the last used instrument, logging a practice
 * session (today, or a tapped empty past day) and the current week.
 */
export function ProfileScreen({ profile, practiceStore }: ProfileScreenProps) {
  const [logging, setLogging] = useState(false);
  // The day to preselect in the panel; `undefined` = today.
  const [logDay, setLogDay] = useState<string | undefined>(undefined);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [lastDuration, setLastDuration] = useState(DEFAULT_DURATION);
  const [lastInstrumentId, setLastInstrumentId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [musicDays, setMusicDays] = useState<ReadonlySet<string>>(() => new Set());
  const [savedCount, setSavedCount] = useState(0);

  // A PWA left open overnight shows the new day (and week) when it is visible again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    let active = true;
    practiceStore.listWeek(now).then(
      (practices) => {
        if (active) setMusicDays(new Set(practices.map((practice) => practice.day)));
      },
      () => {
        // Leave the week neutral; the next save or visit loads it again.
      },
    );
    return () => {
      active = false;
    };
  }, [practiceStore, now, savedCount]);

  useEffect(() => {
    let active = true;
    practiceStore.lastPractice().then(
      (practice) => {
        if (active && practice !== null) {
          setLastDuration(practice.durationMinutes);
          setLastInstrumentId(practice.instrumentId);
        }
      },
      () => {
        // Keep the default duration and instrument; logging still works.
      },
    );
    return () => {
      active = false;
    };
  }, [practiceStore]);

  // The last used instrument while it is still in the Profile, else the oldest one.
  const instrument =
    profile.instruments.find((candidate) => candidate.id === lastInstrumentId) ?? profile.instrument;

  const openPanel = (day?: string) => {
    setSavedMessage(null);
    setLogDay(day);
    setLogging(true);
  };

  return (
    <>
      <h1 className="text-5xl font-extrabold tracking-tight break-words">Cześć, {profile.name}!</h1>
      <p className="flex flex-col items-center gap-2 text-3xl font-semibold">
        <span aria-hidden="true" className="text-8xl">
          {instrumentIcon(instrument.name)}
        </span>
        <span>{instrument.name}</span>
      </p>
      {logging ? (
        <LogPractice
          store={practiceStore}
          instruments={profile.instruments}
          initialInstrumentId={instrument.id}
          initialDuration={lastDuration}
          initialDay={logDay}
          onSaved={(practice) => {
            setLastDuration(practice.durationMinutes);
            setLastInstrumentId(practice.instrumentId);
            setLogging(false);
            // The save is stamped with the clock at save time; a session left open
            // across midnight must show that day (and week) as today.
            const at = new Date();
            setSavedMessage(practice.day === dayKey(at) ? SAVED_MESSAGE : backdatedMessage(practice.day));
            setNow(at);
            setSavedCount((n) => n + 1);
          }}
          onCancel={() => setLogging(false)}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => openPanel()}
            className="min-h-20 w-full max-w-sm rounded-3xl bg-amber-300 px-6 text-4xl font-extrabold text-blue-950"
          >
            {LOG_BUTTON}
          </button>
          <p role="status" className="min-h-8 text-2xl font-bold text-amber-300">
            {savedMessage}
          </p>
        </>
      )}
      <BadgesCard savedCount={savedCount} />
      <WeekView
        days={weekDays(now)}
        musicDays={musicDays}
        today={dayKey(now)}
        onLogDay={logging ? undefined : openPanel}
      />
      <ShareCardButton days={weekDays(now)} musicDays={musicDays} instrumentName={instrument.name} />
      <WeeklyGoalCard musicDayCount={musicDays.size} now={now} practiceStore={practiceStore} />
    </>
  );
}
