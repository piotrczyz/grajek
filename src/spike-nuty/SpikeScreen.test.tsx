import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MicError } from './audio/mic.ts';
import { MELODIES, midiToHz, type PitchFrame } from './logic/index.ts';
import SpikeScreen from './SpikeScreen.tsx';
import type { AlignedBar } from './staffModel.ts';

// jsdom has no Web Audio: the audio modules are mocked.
const audio = vi.hoisted(() => ({
  openMic: vi.fn(),
  leadIn: [] as Array<number | undefined>,
  staffBars: [] as AlignedBar[][],
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
    start: (leadIn?: number) => {
      audio.leadIn.push(leadIn);
      return 0;
    },
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
// Telemetry: the queue is mocked (nothing leaves the test), the device id is fixed.
const DEVICE_ID = '0b9f8c2e-4d1a-4c3b-9e8f-1a2b3c4d5e6f';
const telemetry = vi.hoisted(() => ({
  enqueue: vi.fn(),
  flush: vi.fn(() => Promise.resolve()),
  startAutoFlush: vi.fn(() => () => undefined),
}));
vi.mock('./telemetry/queue.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./telemetry/queue.ts')>()),
  enqueue: telemetry.enqueue,
  flush: telemetry.flush,
  startAutoFlush: telemetry.startAutoFlush,
}));
vi.mock('../push/device-id.ts', () => ({
  getOrCreateDeviceId: () => Promise.resolve(DEVICE_ID),
}));
// jsdom cannot measure SVG text: the staff is mocked and records what it gets.
vi.mock('./Staff.tsx', () => ({
  Staff: ({ bars }: { bars: AlignedBar[] }) => {
    audio.staffBars.push(bars);
    return <div data-testid="staff" />;
  },
}));

beforeEach(() => {
  audio.openMic.mockReset();
  audio.frames = [];
  audio.leadIn = [];
  audio.staffBars = [];
  telemetry.enqueue.mockReset();
  telemetry.flush.mockClear();
  telemetry.startAutoFlush.mockClear();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
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

/** Lets the awaited microphone and context promises of Start settle. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

async function recordAndStop() {
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
}

describe('SpikeScreen', () => {
  it('shows the Polish title and the default settings', () => {
    render(<SpikeScreen />);
    expect(screen.getByRole('heading', { name: 'Zagraj i sprawdź (spike)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Instrument')).toHaveDisplayValue('Klarnet B♭');
    expect(screen.getByLabelText('Utwór')).toHaveDisplayValue('Wlazł kotek na płotek');
    expect(screen.getByLabelText('Tempo: 60 BPM')).toHaveValue('60');
    expect(screen.getByLabelText('Czas na przygotowanie')).toHaveDisplayValue('5 s');
    expect(screen.getByLabelText('Ignoruj oktawę')).not.toBeChecked();
    expect(screen.getByLabelText('Tylko wizualny metronom')).not.toBeChecked();
    expect(screen.getByLabelText('Automatyczna korekta opóźnienia')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('shows the reference melody on the staff before Start', () => {
    render(<SpikeScreen />);
    const bars = audio.staffBars.at(-1)!;
    expect(bars).toHaveLength(4);
    expect(bars.every((bar) => bar.played === null)).toBe(true);
    expect(bars[0].reference.filter((slot) => slot.kind === 'note')).toHaveLength(4);
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

  it('counts down the prep time after Start', async () => {
    vi.useFakeTimers();
    audio.openMic.mockResolvedValue({ source: {}, stop: () => undefined });
    render(<SpikeScreen />);
    fireEvent.change(screen.getByLabelText('Czas na przygotowanie'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await settle();
    expect(audio.leadIn).toEqual([3]);
    expect(screen.getByText('Przygotuj się…')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('2')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText('Przygotuj się…')).not.toBeInTheDocument();
    expect(screen.getByText('Odliczanie')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  });

  it('shows the result view with a summary, the note list and both buttons', async () => {
    audio.openMic.mockResolvedValue({ source: {}, stop: () => undefined });
    audio.frames = framesOfMelody();
    render(<SpikeScreen />);
    await recordAndStop();
    expect(await screen.findByText('Wynik: 100%')).toBeInTheDocument();
    expect(screen.getByText('15 z 15 nut dobrze')).toBeInTheDocument();
    expect(screen.getByText('Same wysokości dźwięków: 100%')).toBeInTheDocument();
    expect(screen.getByText('dobra nuta, zły rytm')).toBeInTheDocument();
    expect(screen.getByText('nuta dodatkowa')).toBeInTheDocument();
    expect(screen.getByTestId('staff')).toBeInTheDocument();
    expect(audio.staffBars.at(-1)!.every((bar) => bar.played !== null)).toBe(true);
    expect(screen.getByRole('region', { name: 'Nuta po nucie' })).toHaveTextContent('G4');
    // 15 rows plus the legend entry.
    expect(screen.getAllByText('dobrze')).toHaveLength(16);
    expect(screen.queryByLabelText('Utwór')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zagraj jeszcze raz' })).toBeInTheDocument();
    expect(screen.getByText('Mediana przesunięcia')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zmień utwór' }));
    expect(screen.getByLabelText('Utwór')).toBeInTheDocument();
    expect(screen.queryByText('Wynik: 100%')).not.toBeInTheDocument();
  });

  it('corrects a steady lag and shows the late notes without the correction', async () => {
    audio.openMic.mockResolvedValue({ source: {}, stop: () => undefined });
    // Every note 300 ms late at 60 BPM: rounds one eighth late without the correction.
    audio.frames = framesOfMelody().map((f) => ({ ...f, timeMs: f.timeMs + 300 }));
    render(<SpikeScreen />);
    await recordAndStop();
    expect(await screen.findByText('Wynik: 100%')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Automatyczna korekta opóźnienia'));
    expect(await screen.findByText('Wynik: 50%')).toBeInTheDocument();
    expect(screen.getAllByText('za późno').length).toBeGreaterThan(0);
  });

  it('grades in written pitch for the chosen instrument', async () => {
    audio.openMic.mockResolvedValue({ source: {}, stop: () => undefined });
    audio.frames = framesOfMelody();
    render(<SpikeScreen />);
    fireEvent.change(screen.getByLabelText('Instrument'), { target: { value: 'c' } });
    await recordAndStop();
    // Without the clarinet transposition the played notes sit a tone too low.
    expect(await screen.findByText(/^Wynik: \d+%$/)).not.toHaveTextContent('Wynik: 100%');
  });
});

describe('SpikeScreen telemetry', () => {
  type Enqueued = { kind: string; attemptId: string; body: Record<string, unknown> };
  const enqueued = (kind: 'attempt' | 'feedback') =>
    telemetry.enqueue.mock.calls.map(([item]) => item as Enqueued).filter((item) => item.kind === kind);

  async function finishedAttempt() {
    audio.openMic.mockResolvedValue({ source: {}, stop: () => undefined });
    audio.frames = framesOfMelody();
    render(<SpikeScreen />);
    await recordAndStop();
    await screen.findByText('Wynik: 100%');
    await waitFor(() => expect(enqueued('attempt')).toHaveLength(1));
  }

  it('shows the notice and the switch on both views, switched on by default', async () => {
    audio.openMic.mockResolvedValue({ source: {}, stop: () => undefined });
    audio.frames = framesOfMelody();
    render(<SpikeScreen />);
    const notice = 'Wysyłamy anonimowe dane o dokładności rozpoznawania (bez nagrania), żeby ulepszyć aplikację.';
    expect(screen.getByText(notice)).toBeInTheDocument();
    expect(screen.getByLabelText('Wysyłaj anonimowe dane')).toBeChecked();
    expect(telemetry.startAutoFlush).toHaveBeenCalledTimes(1);
    expect(telemetry.flush).toHaveBeenCalled();
    await recordAndStop();
    await screen.findByText('Wynik: 100%');
    expect(screen.getByText(notice)).toBeInTheDocument();
    expect(screen.getByLabelText('Wysyłaj anonimowe dane')).toBeChecked();
  });

  it('enqueues one record per finished attempt, ended by the Stop button', async () => {
    await finishedAttempt();
    const [item] = enqueued('attempt');
    expect(item.attemptId).toMatch(/^[0-9a-f-]{36}$/);
    expect(item.body).toMatchObject({
      v: 1,
      deviceId: DEVICE_ID,
      ended: 'stopped',
      settings: { melodyId: MELODIES[0].id, instrument: 'clarinet-bb', bpm: 60, autoLatency: true },
      result: { scorePercent: 100 },
    });
    expect(item.body).not.toHaveProperty('name');
    // Re-grading the same recording does not send it again.
    fireEvent.click(screen.getByLabelText('Automatyczna korekta opóźnienia'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(enqueued('attempt')).toHaveLength(1);
    // A new attempt gets its own record and id.
    fireEvent.click(screen.getByRole('button', { name: 'Zagraj jeszcze raz' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(enqueued('attempt')).toHaveLength(2));
    expect(enqueued('attempt')[1].attemptId).not.toBe(item.attemptId);
  });

  it('marks an attempt ended by the timer as complete', async () => {
    vi.useFakeTimers();
    audio.openMic.mockResolvedValue({ source: {}, stop: () => undefined });
    audio.frames = framesOfMelody();
    render(<SpikeScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await settle();
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000);
    });
    await settle();
    expect(screen.getByText('Wynik: 100%')).toBeInTheDocument();
    expect(enqueued('attempt')).toHaveLength(1);
    expect(enqueued('attempt')[0].body).toMatchObject({ ended: 'complete' });
  });

  it('sends nothing and hides the question when the switch is off', async () => {
    audio.openMic.mockResolvedValue({ source: {}, stop: () => undefined });
    audio.frames = framesOfMelody();
    render(<SpikeScreen />);
    fireEvent.click(screen.getByLabelText('Wysyłaj anonimowe dane'));
    expect(screen.getByLabelText('Wysyłaj anonimowe dane')).not.toBeChecked();
    expect(localStorage.getItem('grajek.spikeNuty.telemetry')).toBe('off');
    await recordAndStop();
    await screen.findByText('Wynik: 100%');
    await act(async () => {
      await Promise.resolve();
    });
    expect(telemetry.enqueue).not.toHaveBeenCalled();
    expect(screen.queryByText('Czy ocena się zgadza?')).not.toBeInTheDocument();
  });

  it('enqueues agreement when the player answers Tak', async () => {
    await finishedAttempt();
    const attemptId = enqueued('attempt')[0].attemptId;
    const question = await screen.findByRole('region', { name: 'Czy ocena się zgadza?' });
    fireEvent.click(within(question).getByRole('button', { name: 'Tak' }));
    expect(enqueued('feedback')).toEqual([
      {
        kind: 'feedback',
        attemptId,
        body: { v: 1, deviceId: DEVICE_ID, agrees: true, misjudged: [], regraded: false },
      },
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Dziękujemy!');
  });

  it('enqueues the notes marked as misjudged and the comment when the player answers Nie', async () => {
    await finishedAttempt();
    const question = await screen.findByRole('region', { name: 'Czy ocena się zgadza?' });
    expect(screen.queryByLabelText('aplikacja się pomyliła – nuta 2')).not.toBeInTheDocument();
    fireEvent.click(within(question).getByRole('button', { name: 'Nie' }));
    fireEvent.click(screen.getByLabelText('aplikacja się pomyliła – nuta 2'));
    fireEvent.click(screen.getByLabelText('aplikacja się pomyliła – nuta 5'));
    fireEvent.click(screen.getByLabelText('aplikacja się pomyliła – nuta 7'));
    fireEvent.click(screen.getByLabelText('aplikacja się pomyliła – nuta 7'));
    fireEvent.change(screen.getByLabelText('Komentarz (opcjonalnie)'), {
      target: { value: '  Nuta 5 była dobra  ' },
    });
    // The view was re-graded after the record was sent.
    fireEvent.click(screen.getByLabelText('Automatyczna korekta opóźnienia'));
    fireEvent.click(within(question).getByRole('button', { name: 'Wyślij' }));
    const [feedback] = enqueued('feedback');
    expect(feedback.body).toEqual({
      v: 1,
      deviceId: DEVICE_ID,
      agrees: false,
      misjudged: [
        { refIndex: 1, playedIndex: 1 },
        { refIndex: 4, playedIndex: 4 },
      ],
      comment: 'Nuta 5 była dobra',
      regraded: true,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Dziękujemy!');
  });
});
