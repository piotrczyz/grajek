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
