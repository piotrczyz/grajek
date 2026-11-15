// The three reference melodies of the spike, in WRITTEN pitch, 4/4.
// Notation: `<pitch><octave><q|h>` separated by spaces, bars by `|`.

export interface RefNote {
  midi: number;
  startEighth: number;
  durationEighths: number;
}

export interface Melody {
  id: string;
  /** Polish title shown in the picker. */
  title: string;
  beatsPerBar: 4;
  notes: RefNote[];
}

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DURATION_EIGHTHS: Record<string, number> = { e: 1, q: 2, h: 4, w: 8 };

function parseNotes(source: string): RefNote[] {
  const notes: RefNote[] = [];
  let cursor = 0;
  for (const token of source.split(/\s+/)) {
    if (token === '' || token === '|') continue;
    const match = /^([A-G])(#?)(\d)([eqhw])$/.exec(token);
    if (!match) throw new Error(`Bad note token: ${token}`);
    const [, letter, sharp, octave, duration] = match;
    const midi = (Number(octave) + 1) * 12 + LETTER_PC[letter] + (sharp ? 1 : 0);
    const durationEighths = DURATION_EIGHTHS[duration];
    notes.push({ midi, startEighth: cursor, durationEighths });
    cursor += durationEighths;
  }
  return notes;
}

export const MELODIES: Melody[] = [
  {
    id: 'wlazl-kotek',
    title: 'Wlazł kotek na płotek',
    beatsPerBar: 4,
    notes: parseNotes('G4q E4q E4q F4q | D4q D4q C4q E4q | G4q E4q E4q F4q | D4q D4q C4h'),
  },
  {
    id: 'panie-janie',
    title: 'Panie Janie',
    beatsPerBar: 4,
    notes: parseNotes('C4q D4q E4q C4q | C4q D4q E4q C4q | E4q F4q G4h | E4q F4q G4h'),
  },
  {
    id: 'cwiczenie-efg',
    title: 'Ćwiczenie E-F-G (niski rejestr)',
    beatsPerBar: 4,
    notes: parseNotes('E3q F3q G3h | G3q F3q E3h | E3q F3q G3q A3q | G3q F3q E3h'),
  },
];

export function melodyLengthEighths(melody: Melody): number {
  return melody.notes.reduce((end, note) => Math.max(end, note.startEighth + note.durationEighths), 0);
}
