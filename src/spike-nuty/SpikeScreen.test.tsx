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
  const enqueued = (kind: 'attempt') =>
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


  it('sends nothing when the switch is off', async () => {
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
  });

  it('asks nothing after a finished attempt: no manual feedback, the notice and the switch stay', async () => {
    await finishedAttempt();
    expect(screen.queryByText('Czy ocena się zgadza?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tak' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nie' })).not.toBeInTheDocument();
    expect(screen.queryByText(/aplikacja się pomyliła/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Komentarz/)).not.toBeInTheDocument();
    const table = within(screen.getByRole('region', { name: 'Nuta po nucie' }));
    expect(table.queryAllByRole('checkbox')).toHaveLength(0);
    expect(
      screen.getByText('Wysyłamy anonimowe dane o dokładności rozpoznawania (bez nagrania), żeby ulepszyć aplikację.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Wysyłaj anonimowe dane')).toBeChecked();
    // Only the attempt record is queued.
    expect(telemetry.enqueue.mock.calls.every(([item]) => (item as Enqueued).kind === 'attempt')).toBe(true);
  });

  it('sends the automatic estimate, the attempt signal and the note window levels in the record', async () => {
    await finishedAttempt();
    const { body } = enqueued('attempt')[0];
    expect(body.estimate).toMatchObject({ heuristicVersion: '1', estimatedAccuracy: 1 });
    expect(body.signal).toMatchObject({ frames: framesOfMelody().length });
    const notes = body.notes as Array<{ windowLevelDb: number | null }>;
    expect(notes[0].windowLevelDb).toBeGreaterThan(-30);
    const events = body.events as Array<{ pitchSpreadCents: number }>;
    expect(events[0].pitchSpreadCents).toBe(0);
  });
});

describe('SpikeScreen recognition estimate', () => {
  const ESTIMATE_TEXTS = [
    'Szacowana dokładność rozpoznawania',
    'Odsetek ramek bez wysokości',
    'Mediana pewności',
    'Rozrzut opóźnienia',
    'Zdarzenia na nutę',
    'Przerwana',
  ];

  it('shows the heuristic only in the diagnostics panel, after opening it', async () => {
    audio.openMic.mockResolvedValue({ source: {}, stop: () => undefined });
    audio.frames = framesOfMelody();
    render(<SpikeScreen />);
    await recordAndStop();
    await screen.findByText('Wynik: 100%');
    // The default result view (what the child sees) has none of it.
    for (const text of ESTIMATE_TEXTS) expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(screen.queryByText('ok')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Szacunek rozpoznawania (dla zespołu)' })).not.toBeInTheDocument();

    const diagnostics = within(screen.getByRole('region', { name: 'Diagnostyka' }));
    fireEvent.click(diagnostics.getByRole('button', { name: 'Pokaż szacunek rozpoznawania' }));
    const panel = within(diagnostics.getByRole('region', { name: 'Szacunek rozpoznawania (dla zespołu)' }));
    for (const text of ESTIMATE_TEXTS) expect(panel.getByText(text)).toBeInTheDocument();
    expect(panel.getByText('100%')).toBeInTheDocument();
    // Stopped with the button.
    expect(panel.getByText('tak')).toBeInTheDocument();
    // 15 reference notes, all played right.
    expect(panel.getAllByText('ok')).toHaveLength(15);
    // Not inside the result sections.
    expect(within(screen.getByRole('region', { name: 'Nuta po nucie' })).queryByText('ok')).not.toBeInTheDocument();

    fireEvent.click(diagnostics.getByRole('button', { name: 'Ukryj szacunek rozpoznawania' }));
    expect(screen.queryByText('Szacowana dokładność rozpoznawania')).not.toBeInTheDocument();
  });

  it('names the verdict and the reasons of a misrecognised note in Polish', async () => {
    audio.openMic.mockResolvedValue({ source: {}, stop: () => undefined });
    // The 2nd note of the melody heard an octave too high.
    const melody = MELODIES[0];
    const second = melody.notes[1];
    audio.frames = framesOfMelody().map((f) =>
      f.hz !== null && f.timeMs >= second.startEighth * 500 && f.timeMs < (second.startEighth + second.durationEighths) * 500
        ? { ...f, hz: f.hz * 2 }
        : f,
    );
    render(<SpikeScreen />);
    await recordAndStop();
    await screen.findByText(/^Wynik: \d+%$/);
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż szacunek rozpoznawania' }));
    const panel = within(screen.getByRole('region', { name: 'Szacunek rozpoznawania (dla zespołu)' }));
    expect(panel.getByText('błąd rozpoznawania')).toBeInTheDocument();
    expect(panel.getByText('skok o oktawę')).toBeInTheDocument();
  });
});

describe('SpikeScreen note-by-note list on a narrow phone', () => {
  it('lets every cell wrap and keeps the full status word with a colour dot', async () => {
    audio.openMic.mockResolvedValue({ source: {}, stop: () => undefined });
    audio.frames = framesOfMelody();
    render(<SpikeScreen />);
    await recordAndStop();
    await screen.findByText('Wynik: 100%');
    const table = within(screen.getByRole('region', { name: 'Nuta po nucie' })).getByRole('table');
    // No fixed layout and no fixed-width columns that clip text at 360 px.
    expect(table).not.toHaveClass('table-fixed');
    expect(table.querySelectorAll('[class*="w-["], th.w-6, th.w-14')).toHaveLength(0);
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      '#',
      'Wzór',
      'Gra',
      'Cent',
      'Czas',
      'Ocena',
    ]);
    const statusCells = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelectorAll('td')[5]);
    expect(statusCells).toHaveLength(15);
    for (const cell of statusCells) {
      expect(cell.textContent).toBe('dobrze');
      expect(cell.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    }
  });
});
