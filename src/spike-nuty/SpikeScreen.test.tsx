import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MicError } from './audio/mic.ts';
import { MELODIES, midiToHz, type PitchFrame } from './logic/index.ts';
import SpikeScreen from './SpikeScreen.tsx';

// jsdom has no Web Audio: the audio modules are mocked.
const audio = vi.hoisted(() => ({
  openMic: vi.fn(),
  frames: [] as PitchFrame[],
  ctx: {
    currentTime: 0,
    resume: () => Promise.resolve(),
    suspend: () => Promise.resolve(),
  },
}));

vi.mock('./audio/mic.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./audio/mic.ts')>()),
  createAudioContext: () => audio.ctx,
  openMic: audio.openMic,
}));
vi.mock('./audio/metronome.ts', () => ({
  createMetronome: () => ({
    start: () => 0,
    stop: () => undefined,
    clickTimesMs: () => [],
    onBeat: () => undefined,
  }),
}));
vi.mock('./audio/pitchTracker.ts', () => ({
  createPitchTracker: () => ({
    frames: () => audio.frames,
    latest: () => null,
    stop: () => undefined,
    latencyMs: 0,
  }),
}));
// jsdom cannot measure SVG text: the staff is mocked.
vi.mock('./Staff.tsx', () => ({ Staff: () => <div data-testid="staff" /> }));

beforeEach(() => {
  audio.openMic.mockReset();
  audio.frames = [];
});

/** Frames of a clarinet playing the melody exactly at 60 BPM (sounding = written - 2). */
function framesOfMelody(): PitchFrame[] {
  const eighth = 500;
  const frames: PitchFrame[] = [];
  const melody = MELODIES[0];
  const end = (melody.notes.at(-1)!.startEighth + melody.notes.at(-1)!.durationEighths) * eighth;
  for (let t = 0; t < end; t += 20) {
    const note = melody.notes.find(
      (n) => t >= n.startEighth * eighth && t < (n.startEighth + n.durationEighths) * eighth - 60,
    );
    frames.push(
      note
        ? { timeMs: t, hz: midiToHz(note.midi - 2), clarity: 0.99, levelDb: -20 }
        : { timeMs: t, hz: null, clarity: 0, levelDb: -90 },
    );
  }
  return frames;
}

describe('SpikeScreen', () => {
  it('shows the Polish title and the default settings', () => {
    render(<SpikeScreen />);
    expect(screen.getByRole('heading', { name: 'Zagraj i sprawdź (spike)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Instrument')).toHaveDisplayValue('Klarnet B♭');
    expect(screen.getByLabelText('Utwór')).toHaveDisplayValue('Wlazł kotek na płotek');
    expect(screen.getByLabelText('Tempo: 60 BPM')).toHaveValue('60');
    expect(screen.getByLabelText('Ignoruj oktawę')).not.toBeChecked();
    expect(screen.getByLabelText('Tylko wizualny metronom')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('explains a denied microphone in Polish and offers a retry', async () => {
    audio.openMic.mockRejectedValue(new MicError('denied'));
    render(<SpikeScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Brak zgody na mikrofon');
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument();
  });

  it('says when there is no microphone', async () => {
    audio.openMic.mockRejectedValue(new MicError('unavailable'));
    render(<SpikeScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nie znaleziono mikrofonu');
  });

  it('grades a recording and shows the score', async () => {
    audio.openMic.mockResolvedValue({ source: {}, stop: () => undefined });
    audio.frames = framesOfMelody();
    render(<SpikeScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    expect(await screen.findByText('Wynik: 100%')).toBeInTheDocument();
    expect(screen.getByText('Same wysokości dźwięków: 100%')).toBeInTheDocument();
    expect(screen.getByTestId('staff')).toBeInTheDocument();
    expect(screen.getByText('żółta – dobra nuta, zły rytm')).toBeInTheDocument();
  });

  it('re-grades in written pitch when the instrument changes', async () => {
    audio.openMic.mockResolvedValue({ source: {}, stop: () => undefined });
    audio.frames = framesOfMelody();
    render(<SpikeScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'c' } });
    // Without the clarinet transposition the played notes sit a tone too low.
    expect(await screen.findByText(/^Wynik: \d+%$/)).not.toHaveTextContent('Wynik: 100%');
  });
});
