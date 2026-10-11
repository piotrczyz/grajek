import { useState } from 'react';
import { buildCardModel, type CardModel } from './cardModel.ts';
import { DOWNLOADED_MESSAGE, SHARE_BUTTON, SHARE_FAILED_MESSAGE } from './copy.ts';
import { renderCardPng } from './renderCard.ts';
import { shareCardImage, type ShareOutcome } from './shareCard.ts';

interface ShareCardButtonProps {
  /** The 7 day keys of the week, Monday first (see `weekDays`). */
  days: string[];
  /** Day keys with at least one practice session (Dzień z muzyką). */
  musicDays: ReadonlySet<string>;
  instrumentName: string;
  /** Injectable for tests; defaults to the Canvas 2D renderer. */
  render?: (model: CardModel) => Promise<Blob>;
  /** Injectable for tests; defaults to the system share sheet with a download fallback. */
  share?: (blob: Blob) => Promise<ShareOutcome>;
}

/** "Pokaż rodzinie": draws the Progress Card on the device and shares (or downloads) it. */
export function ShareCardButton({
  days,
  musicDays,
  instrumentName,
  render = renderCardPng,
  share = shareCardImage,
}: ShareCardButtonProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!days.some((day) => musicDays.has(day))) return null;

  const onClick = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // The render is the only await before `share`: the share sheet needs the tap's user activation.
      const blob = await render(buildCardModel({ days, musicDays, instrumentName }));
      const outcome = await share(blob);
      if (outcome === 'downloaded') setMessage(DOWNLOADED_MESSAGE);
    } catch {
      setMessage(SHARE_FAILED_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy}
        className="min-h-16 w-full max-w-sm rounded-3xl border-4 border-amber-300 px-6 text-3xl font-extrabold text-amber-300 disabled:opacity-60"
      >
        {SHARE_BUTTON}
      </button>
      <p role="status" className="min-h-8 text-2xl font-bold text-amber-300">
        {message}
      </p>
    </>
  );
}
