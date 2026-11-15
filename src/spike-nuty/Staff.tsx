// Draws the staff with VexFlow (SVG). With a result: two labelled rows per
// system, "Wzór" over "Zagrałeś", both bar voices formatted by one Formatter
// so a played note stands under the reference note of the same eighth.
// Without a result: the reference row only. The mapping lives in
// staffModel.ts; this file only draws and reports taps on notes.
import { useEffect, useRef } from 'react';
import { Accidental, Dot, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow/bravura';
import * as copy from './copy.ts';
import type { AlignedBar, StaffSlot } from './staffModel.ts';

export interface StaffSelection {
  refIndex: number | null;
  playedIndex: number | null;
}

interface StaffProps {
  bars: AlignedBar[];
  /** Called when a note or a missing-note rest is tapped. */
  onSelect?: (selection: StaffSelection) => void;
}

const STAVE_GAP = 100;
const SYSTEM_HEIGHT = 230;
const SINGLE_SYSTEM_HEIGHT = 120;
const MARGIN = 5;
const CLEF_EXTRA = 70;
const LABEL_OFFSET = 14;

function toVexNote(slot: StaffSlot): StaveNote {
  const vex = new StaveNote({
    keys: [slot.key],
    duration: slot.kind === 'rest' ? `${slot.duration}r` : slot.duration,
    autoStem: slot.kind === 'note',
  });
  if (slot.accidental) vex.addModifier(new Accidental(slot.accidental), 0);
  if (slot.duration.endsWith('d')) Dot.buildAndAttach([vex], { all: true });
  vex.setStyle({ fillStyle: slot.colour, strokeStyle: slot.colour });
  return vex;
}

export function Staff({ bars, onSelect }: StaffProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '';
    if (bars.length === 0) return;

    const twoRows = bars.some((bar) => bar.played !== null);
    const systemHeight = twoRows ? SYSTEM_HEIGHT : SINGLE_SYSTEM_HEIGHT;
    const width = Math.max(300, host.clientWidth || 340);
    const barsPerSystem = width < 520 ? 2 : 4;
    const systems = Math.ceil(bars.length / barsPerSystem);
    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(width, systems * systemHeight);
    const context = renderer.getContext();
    const barWidth = (width - 2 * MARGIN - CLEF_EXTRA) / barsPerSystem;
    const tappable: Array<[StaveNote, StaffSlot]> = [];

    bars.forEach((bar, index) => {
      const system = Math.floor(index / barsPerSystem);
      const column = index % barsPerSystem;
      const first = column === 0;
      const x = MARGIN + (first ? 0 : CLEF_EXTRA + column * barWidth);
      const w = barWidth + (first ? CLEF_EXTRA : 0);
      const y = system * systemHeight;

      const rows = bar.played === null ? [bar.reference] : [bar.reference, bar.played];
      const drawn = rows.map((slots, row) => {
        const stave = new Stave(x, y + row * STAVE_GAP, w);
        if (first) stave.addClef('treble');
        if (first && system === 0) stave.addTimeSignature('4/4');
        stave.setContext(context).draw();
        if (first && twoRows) {
          context.save();
          context.setFont('sans-serif', 11, 'bold');
          context.fillText(row === 0 ? copy.ROW_REFERENCE : copy.ROW_PLAYED, MARGIN, y + row * STAVE_GAP + LABEL_OFFSET);
          context.restore();
        }
        const notes = slots.map(toVexNote);
        slots.forEach((slot, i) => tappable.push([notes[i], slot]));
        const voice = new Voice({ numBeats: 4, beatValue: 4 });
        voice.setMode(Voice.Mode.STRICT);
        voice.addTickables(notes);
        voice.setStave(stave);
        return { stave, voice };
      });

      // One formatter for both rows: shared tick contexts line them up in time.
      const formatter = new Formatter();
      for (const { voice } of drawn) formatter.joinVoices([voice]);
      const { stave } = drawn[0];
      formatter.format(
        drawn.map((d) => d.voice),
        stave.getNoteEndX() - stave.getNoteStartX() - 10,
      );
      for (const d of drawn) d.voice.draw(context, d.stave);
    });

    for (const [note, slot] of tappable) {
      if (slot.refIndex === null && slot.playedIndex === null) continue;
      const element = note.getSVGElement();
      if (!element) continue;
      element.style.cursor = 'pointer';
      element.addEventListener('click', () =>
        onSelectRef.current?.({ refIndex: slot.refIndex, playedIndex: slot.playedIndex }),
      );
    }
  }, [bars]);

  return <div ref={hostRef} className="w-full overflow-x-auto" />;
}
