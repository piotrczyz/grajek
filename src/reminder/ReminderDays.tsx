import { useEffect, useId, useState } from 'react';
import { WEEKDAY_LABELS } from '../practice/week.ts';
import {
  createIndexedDbPracticeTimeStore,
  WEEKDAYS,
  type PracticeTime,
  type Weekday,
} from '../practice-time/index.ts';
import { REMINDER_TEXT } from './copy.ts';
import { reminderWeekdays, type ReminderDays as Days } from './reminder.ts';
import { loadReminderDays, saveReminderDays } from './reminderStore.ts';
import { syncReminder } from './sync.ts';

interface ReminderDaysProps {
  loadDays?: () => Promise<Days>;
  saveDays?: (days: Days) => Promise<void>;
  loadPracticeTime?: () => Promise<PracticeTime | null>;
  sync?: () => Promise<unknown>;
}

const toggleClass = (pressed: boolean, size: string) =>
  [
    'min-h-14 rounded-2xl border-2 font-semibold transition active:scale-95',
    size,
    pressed ? 'border-amber-300 bg-amber-300 text-blue-950' : 'border-white/40 bg-white/10 text-white',
  ].join(' ');

/** "Codziennie" or "W wybrane dni" for the daily reminder (roadmap S-08). */
export function ReminderDays({
  loadDays = loadReminderDays,
  saveDays = saveReminderDays,
  loadPracticeTime,
  sync = syncReminder,
}: ReminderDaysProps) {
  const [loadPora] = useState(
    () => loadPracticeTime ?? (() => createIndexedDbPracticeTimeStore().load()),
  );
  const [days, setDays] = useState<Days | null>(null);
  const [hasPora, setHasPora] = useState(true);
  const questionId = useId();

  useEffect(() => {
    let active = true;
    loadDays().then(
      (loaded) => active && setDays(loaded),
      () => active && setDays({ mode: 'all' }),
    );
    loadPora().then(
      (practiceTime) => active && setHasPora(practiceTime !== null),
      () => {},
    );
    // Covers a device that has just turned notifications on.
    void sync();
    return () => {
      active = false;
    };
  }, [loadDays, loadPora, sync]);

  if (!days) return null;

  const choose = (next: Days) => {
    setDays(next);
    saveDays(next).then(
      () => void sync(),
      () => {},
    );
  };

  const chosen = days.mode === 'chosen' ? reminderWeekdays(days) : null;

  const toggleDay = (day: Weekday) => {
    if (!chosen) return;
    const weekdays = chosen.includes(day) ? chosen.filter((d) => d !== day) : [...chosen, day];
    choose({ mode: 'chosen', weekdays: WEEKDAYS.filter((d) => weekdays.includes(d)) });
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p id={questionId} className="text-xl font-semibold">
        {REMINDER_TEXT.question}
      </p>
      <div role="group" aria-labelledby={questionId} className="grid w-full grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={days.mode === 'all'}
          className={toggleClass(days.mode === 'all', 'px-3 text-lg')}
          onClick={() => days.mode !== 'all' && choose({ mode: 'all' })}
        >
          {REMINDER_TEXT.everyDay}
        </button>
        <button
          type="button"
          aria-pressed={days.mode === 'chosen'}
          className={toggleClass(days.mode === 'chosen', 'px-3 text-lg')}
          onClick={() => days.mode !== 'chosen' && choose({ mode: 'chosen', weekdays: [...WEEKDAYS] })}
        >
          {REMINDER_TEXT.chosenDays}
        </button>
      </div>
      {chosen && (
        <div role="group" aria-label={REMINDER_TEXT.daysGroup} className="grid w-full grid-cols-7 gap-1">
          {WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              aria-pressed={chosen.includes(day)}
              aria-label={WEEKDAY_LABELS[day - 1].full}
              className={toggleClass(chosen.includes(day), 'text-base')}
              onClick={() => toggleDay(day)}
            >
              {WEEKDAY_LABELS[day - 1].short}
            </button>
          ))}
        </div>
      )}
      {chosen && chosen.length === 0 && <p className="text-lg leading-snug">{REMINDER_TEXT.noDays}</p>}
      {!hasPora && <p className="text-lg leading-snug">{REMINDER_TEXT.noPracticeTime}</p>}
    </div>
  );
}
