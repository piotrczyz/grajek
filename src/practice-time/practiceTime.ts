/**
 * The student's (Uczeń) Pora ćwiczeń: when and where they practise.
 *
 * One default slot applies to every weekday; chosen weekdays may override it
 * with their own slot. Pure types and functions, no storage.
 */

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export interface PracticeSlot {
  /** Local time of day, `HH:MM`, 24-hour clock. */
  time: string;
  place: string;
}

export interface PracticeTime {
  default: PracticeSlot;
  overrides: Partial<Record<Weekday, PracticeSlot>>;
  updatedAt: string;
}

export type NewPracticeTime = Omit<PracticeTime, 'updatedAt'>;

export const PLACE_MAX_LENGTH = 24;

export const DEFAULT_SLOT: PracticeSlot = { time: '17:00', place: 'W domu' };

export type PracticeTimeInputReason =
  | 'time-invalid'
  | 'place-empty'
  | 'place-too-long'
  | 'weekday-invalid';

export type PracticeTimeInputResult =
  | { ok: true; value: NewPracticeTime }
  | { ok: false; reason: PracticeTimeInputReason };

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type SlotResult = { ok: true; value: PracticeSlot } | { ok: false; reason: PracticeTimeInputReason };

function validateSlot(slot: PracticeSlot): SlotResult {
  if (typeof slot?.time !== 'string' || !TIME_PATTERN.test(slot.time)) {
    return { ok: false, reason: 'time-invalid' };
  }
  const place = typeof slot.place === 'string' ? slot.place.trim() : '';
  if (place.length === 0) return { ok: false, reason: 'place-empty' };
  if (place.length > PLACE_MAX_LENGTH) return { ok: false, reason: 'place-too-long' };
  return { ok: true, value: { time: slot.time, place } };
}

function isWeekdayKey(key: string): boolean {
  return /^[1-7]$/.test(key);
}

export function validatePracticeTime(input: NewPracticeTime): PracticeTimeInputResult {
  const base = validateSlot(input.default);
  if (!base.ok) return base;

  const overrides: Partial<Record<Weekday, PracticeSlot>> = {};
  for (const [key, slot] of Object.entries(input.overrides ?? {})) {
    if (!isWeekdayKey(key)) return { ok: false, reason: 'weekday-invalid' };
    if (slot === undefined) continue;
    const checked = validateSlot(slot);
    if (!checked.ok) return checked;
    overrides[Number(key) as Weekday] = checked.value;
  }
  return { ok: true, value: { default: base.value, overrides } };
}

/** The ISO weekday of the device's local date. */
export function weekdayOf(date: Date): Weekday {
  const day = date.getDay(); // 0 = Sunday … 6 = Saturday
  return (day === 0 ? 7 : day) as Weekday;
}

/** The slot that applies on `date`: that weekday's override, else the default. */
export function slotFor(practiceTime: Pick<PracticeTime, 'default' | 'overrides'>, date: Date): PracticeSlot {
  return practiceTime.overrides[weekdayOf(date)] ?? practiceTime.default;
}
