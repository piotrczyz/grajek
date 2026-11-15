// Draws the reference melody (upper stave) and the played notes (lower stave)
// of every system with VexFlow (SVG), each note coloured by its grade. The
// mapping lives in staffModel.ts; this file only draws. Systems wrap to fit
// the phone width.
import { useEffect, useRef } from 'react';
import { Accidental, Dot, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow/bravura';
import type { CompareResult } from './logic/index.ts';
import { toStaffBars, type StaffNote } from './staffModel.ts';

interface StaffProps {
  reference: CompareResult['reference'];
  played: CompareResult['played'];
}

const STAVE_GAP = 100;
const SYSTEM_HEIGHT = 230;
const MARGIN = 5;
const CLEF_EXTRA = 70;

function toVexNote(note: StaffNote): StaveNote {
  const vex = new StaveNote({
    keys: [note.key],
    duration: note.duration,
    autoStem: true,
  });
  if (note.accidental) vex.addModifier(new Accidental(note.accidental), 0);
  if (note.duration.endsWith('d')) Dot.buildAndAttach([vex], { all: true });
  vex.setStyle({ fillStyle: note.colour, strokeStyle: note.colour });
  return vex;
}

export function Staff({ reference, played }: StaffProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '';
    const bars = toStaffBars(reference, played);
    if (bars.length === 0) return;

    const width = Math.max(300, host.clientWidth || 340);
    const barsPerSystem = width < 520 ? 2 : 4;
    const systems = Math.ceil(bars.length / barsPerSystem);
    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(width, systems * SYSTEM_HEIGHT);
    const context = renderer.getContext();
    const barWidth = (width - 2 * MARGIN - CLEF_EXTRA) / barsPerSystem;

    bars.forEach((bar, index) => {
      const system = Math.floor(index / barsPerSystem);
      const column = index % barsPerSystem;
      const first = column === 0;
      const x = MARGIN + (first ? 0 : CLEF_EXTRA + column * barWidth);
      const w = barWidth + (first ? CLEF_EXTRA : 0);
      const y = system * SYSTEM_HEIGHT;

      [bar.reference, bar.played].forEach((notes, row) => {
        const stave = new Stave(x, y + row * STAVE_GAP, w);
        if (first) stave.addClef('treble');
        if (first && system === 0) stave.addTimeSignature('4/4');
        stave.setContext(context).draw();
        if (notes.length === 0) return;
        const voice = new Voice({ numBeats: 4, beatValue: 4 });
        voice.setMode(Voice.Mode.SOFT);
        voice.addTickables(notes.map(toVexNote));
        new Formatter().joinVoices([voice]).format([voice], stave.getNoteEndX() - stave.getNoteStartX() - 10);
        voice.draw(context, stave);
      });
    });
  }, [reference, played]);

  return <div ref={hostRef} className="w-full overflow-x-auto" />;
}
