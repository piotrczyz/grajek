import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MicError } from './audio/mic.ts';
import SpikeScreen from './SpikeScreen.tsx';

// jsdom has no Web Audio: the audio modules are mocked.
const audio = vi.hoisted(() => ({
  openMic: vi.fn(),
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
vi.mock('./audio/metronome.ts', () => ({ createMetronome: vi.fn() }));
vi.mock('./audio/pitchTracker.ts', () => ({ createPitchTracker: vi.fn() }));

beforeEach(() => {
  audio.openMic.mockReset();
});

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
});
