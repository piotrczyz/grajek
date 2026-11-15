// Microphone access for the spike: voice processing off (it distorts sustained
// tones and level), failures mapped to typed errors the screen can explain.

export type MicErrorKind = 'denied' | 'unavailable' | 'other';

export class MicError extends Error {
  readonly kind: MicErrorKind;

  constructor(kind: MicErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'MicError';
    this.kind = kind;
  }
}

export interface Mic {
  source: MediaStreamAudioSourceNode;
  stop(): void;
}

/** The AudioContext, created inside the Start tap (iOS needs a user gesture). */
export function createAudioContext(): AudioContext {
  return new AudioContext();
}

function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    return String((error as { name: unknown }).name);
  }
  return '';
}

function toMicError(error: unknown): MicError {
  const name = errorName(error);
  if (name === 'NotAllowedError' || name === 'SecurityError') return new MicError('denied', name);
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new MicError('unavailable', name);
  }
  return new MicError('other', name || String(error));
}

export async function openMic(ctx: AudioContext): Promise<Mic> {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (!devices || typeof devices.getUserMedia !== 'function') {
    throw new MicError('unavailable', 'navigator.mediaDevices missing');
  }
  let stream: MediaStream;
  try {
    stream = await devices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (error) {
    throw toMicError(error);
  }
  const source = ctx.createMediaStreamSource(stream);
  return {
    source,
    stop() {
      source.disconnect();
      for (const track of stream.getTracks()) track.stop();
    },
  };
}
