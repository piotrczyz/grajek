import { logDayHint, MUSIC_DAY_LABEL, TODAY_LABEL, WEEK_LABEL } from './copy.ts';
import { backdateDays, WEEKDAY_LABELS } from './week.ts';

interface WeekViewProps {
  /** The 7 day keys of the week, Monday first (see `weekDays`). */
  days: string[];
  /** Day keys with at least one practice session (Dzień z muzyką). */
  musicDays: ReadonlySet<string>;
  /** Today's day key; outlined when it is in `days`. */
  today: string;
  /**
   * Called with the day key when an empty past day (1 to 3 days back) is
   * tapped; without it the view is display-only.
   */
  onLogDay?: (day: string) => void;
}

/** Music days are filled amber with a note; empty days stay neutral, never red. */
const MUSIC_DAY_CLASS = 'bg-amber-300 text-blue-950';
const EMPTY_DAY_CLASS = 'bg-white/10 text-white';

/** Past days a session may still be logged for, relative to the `today` key. */
function pastLoggableDays(today: string): Set<string> {
  const [year, month, date] = today.split('-').map(Number);
  return new Set(backdateDays(new Date(year, month - 1, date)).slice(1));
}

function dayLabel(full: string, music: boolean, isToday: boolean): string {
  return [music ? `${full}: ${MUSIC_DAY_LABEL}` : full, isToday ? TODAY_LABEL : null]
    .filter(Boolean)
    .join(' ');
}

/**
 * The current week, Monday to Sunday, with every Dzień z muzyką highlighted.
 * With `onLogDay`, the empty days 1 to 3 days back are buttons to log them.
 */
export function WeekView({ days, musicDays, today, onLogDay }: WeekViewProps) {
  const loggable = onLogDay ? pastLoggableDays(today) : new Set<string>();
  return (
    <ul aria-label={WEEK_LABEL} className="grid w-full max-w-sm grid-cols-7 gap-1.5">
      {days.map((day, index) => {
        const music = musicDays.has(day);
        const isToday = day === today;
        const { short, full } = WEEKDAY_LABELS[index];
        const tappable = onLogDay !== undefined && !music && loggable.has(day);
        const content = (
          <>
            <span aria-hidden="true">{short}</span>
            <span aria-hidden="true" className="h-6 text-xl leading-6">
              {music ? '♪' : tappable ? '+' : ''}
            </span>
          </>
        );
        return (
          <li
            key={day}
            aria-label={dayLabel(full, music, isToday)}
            className={[
              'flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-xl text-base font-bold',
              music ? MUSIC_DAY_CLASS : EMPTY_DAY_CLASS,
              isToday ? 'ring-4 ring-white' : '',
            ].join(' ')}
          >
            {tappable ? (
              <button
                type="button"
                aria-label={logDayHint(full)}
                onClick={() => onLogDay(day)}
                className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-white/60"
              >
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
