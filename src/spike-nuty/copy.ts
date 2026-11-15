/** Polish texts of the "Zagraj i sprawdź" spike screen. */
import type { Instrument } from './logic/index.ts';

export const TITLE = 'Zagraj i sprawdź (spike)';
export const INTRO = 'Prototyp do testów: wybierz utwór, zagraj do metronomu i zobacz, które nuty wyszły.';
export const MELODY_LABEL = 'Utwór';
export const INSTRUMENT_LABEL = 'Instrument';
export const INSTRUMENT_NAMES: Record<Instrument, string> = {
  'clarinet-bb': 'Klarnet B♭',
  c: 'Instrument w C',
};
export const tempoLabel = (bpm: number) => `Tempo: ${bpm} BPM`;
export const IGNORE_OCTAVE_LABEL = 'Ignoruj oktawę';
export const VISUAL_METRONOME_LABEL = 'Tylko wizualny metronom';
export const START_BUTTON = 'Start';
export const STOP_BUTTON = 'Stop';
export const STAFF_HEADING = 'Nuty';
export const SCORE_HEADING = 'Wynik';
export const DIAGNOSTICS_HEADING = 'Diagnostyka';
export const DIAGNOSTICS_EMPTY = 'Brak danych – naciśnij Start.';

// Recording (phase 4).
export const STARTING = 'Włączam mikrofon…';
export const countInLabel = (beat: number) => `Odliczanie: ${beat}`;
export const beatLabel = (bar: number, beat: number) => `Takt ${bar}, miara ${beat}`;
export const RECORDING = 'Nagrywam – graj!';
export const MIC_DENIED =
  'Brak zgody na mikrofon. Zezwól na mikrofon dla tej strony w ustawieniach Safari i spróbuj ponownie.';
export const MIC_UNAVAILABLE = 'Nie znaleziono mikrofonu w tym urządzeniu albo przeglądarce.';
export const MIC_OTHER = 'Nie udało się włączyć mikrofonu.';
export const RETRY_BUTTON = 'Spróbuj ponownie';
export const LIVE_HEADING = 'Na żywo';
export const LIVE_HZ = 'Częstotliwość';
export const LIVE_SOUNDING = 'Nuta (brzmiąca)';
export const LIVE_WRITTEN = 'Nuta (zapis)';
export const LIVE_CENTS = 'Centy';
export const LIVE_LEVEL = 'Poziom';
export const LIVE_CLARITY = 'Pewność';
export const LATENCY = 'Opóźnienie wyjścia audio (odjęte)';
export const EVENTS_HEADING = 'Wykryte zdarzenia';
export const EVENTS_EMPTY = 'Nie wykryto żadnych nut.';
export const EVENT_COLUMNS = ['Nuta (zapis)', 'Start ms', 'Długość ms', 'Oktawa?', 'Duodecyma?'] as const;

// Results (phase 5, feedback 1).
export const scoreLabel = (percent: number) => `Wynik: ${percent}%`;
export const pitchLabel = (percent: number) => `Same wysokości dźwięków: ${percent}%`;
export const LEGEND: Array<[grade: 'green' | 'yellow' | 'red' | 'extra', text: string]> = [
  ['green', 'dobrze'],
  ['yellow', 'dobra nuta, zły rytm'],
  ['red', 'zła lub brakująca nuta'],
  ['extra', 'nuta dodatkowa'],
];
export const ROW_REFERENCE = 'Wzór';
export const ROW_PLAYED = 'Zagrałeś';
export const PLAY_AGAIN_BUTTON = 'Zagraj jeszcze raz';
export const CHANGE_SONG_BUTTON = 'Zmień utwór';
export const NOTES_TABLE_HEADING = 'Nuta po nucie';
export const NOTES_TABLE_HINT = 'Dotknij nuty na pięciolinii, żeby zobaczyć jej wiersz.';
export const NOTE_COLUMNS = ['Nr', 'Wzór', 'Gra', 'Cent', 'Czas', 'Status'] as const;
export const STATUS = {
  good: 'dobrze',
  late: 'za późno',
  early: 'za wcześnie',
  rhythm: 'zły rytm',
  wrongPitch: 'zła nuta',
  missing: 'brak',
  extra: 'dodatkowa',
} as const;
export const TOO_SHORT = 'za krótko';
export const TOO_LONG = 'za długo';
export const NONE = '–';

/** Polish plural form: 1 nuta, 2 nuty, 5 nut, 12 nut, 22 nuty. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const last = n % 10;
  const lastTwo = n % 100;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

/** Signed milliseconds with a real minus sign: "+180 ms", "−120 ms", "0 ms". */
export function signedMs(ms: number): string {
  const rounded = Math.round(ms);
  if (rounded > 0) return `+${rounded} ms`;
  if (rounded < 0) return `−${-rounded} ms`;
  return '0 ms';
}

export interface SummaryCounts {
  total: number;
  good: number;
  late: number;
  early: number;
  rhythm: number;
  wrongPitch: number;
  missing: number;
  extra: number;
}

/** One line for the child, e.g. "8 z 10 nut dobrze, 2 za późno, 1 zła nuta"; zero counts are left out. */
export function summaryText(s: SummaryCounts): string {
  const parts = [`${s.good} z ${s.total} ${plural(s.total, 'nuty', 'nut', 'nut')} dobrze`];
  if (s.late > 0) parts.push(`${s.late} za późno`);
  if (s.early > 0) parts.push(`${s.early} za wcześnie`);
  if (s.rhythm > 0) parts.push(`${s.rhythm} ${plural(s.rhythm, 'zła długość', 'złe długości', 'złych długości')}`);
  if (s.wrongPitch > 0) parts.push(`${s.wrongPitch} ${plural(s.wrongPitch, 'zła nuta', 'złe nuty', 'złych nut')}`);
  if (s.missing > 0) parts.push(`${s.missing} ${plural(s.missing, 'brakująca', 'brakujące', 'brakujących')}`);
  if (s.extra > 0) parts.push(`${s.extra} ${plural(s.extra, 'dodatkowa', 'dodatkowe', 'dodatkowych')}`);
  return parts.join(', ');
}

// Getting ready (feedback 1).
export const PREP_LABEL = 'Czas na przygotowanie';
export const prepOption = (sec: number) => `${sec} s`;
export const GET_READY = 'Przygotuj się…';
export const COUNT_IN = 'Odliczanie';
export const PLAY_NOW = 'Graj!';
export const barLabel = (bar: number) => `Takt ${bar}`;

// Timing correction in diagnostics (feedback 1).
export const AUTO_LATENCY_LABEL = 'Automatyczna korekta opóźnienia';
export const MEAN_OFFSET = 'Średnie przesunięcie';
export const MEDIAN_OFFSET = 'Mediana przesunięcia';
export const APPLIED_CORRECTION = 'Zastosowana korekta';
export const offsetSamples = (n: number) => `(z ${n} ${plural(n, 'nuty', 'nut', 'nut')})`;
