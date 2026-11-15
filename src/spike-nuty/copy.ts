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
export const STAFF_EMPTY = 'Tu pojawią się nuty wzorcowe i zagrane.';
export const SCORE_HEADING = 'Wynik';
export const SCORE_EMPTY = 'Zagraj utwór, żeby zobaczyć wynik.';
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
export const LATENCY = 'Korekta opóźnienia';
export const EVENTS_HEADING = 'Wykryte zdarzenia';
export const EVENTS_EMPTY = 'Nie wykryto żadnych nut.';
export const EVENT_COLUMNS = ['Nuta (zapis)', 'Start ms', 'Długość ms', 'Oktawa?', 'Duodecyma?'] as const;
