import { CARD_FILE_NAME, SHARE_TEXT, SHARE_TITLE } from './copy.ts';

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded';

export interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
}

export interface ShareDeps {
  navigator?: ShareNavigator;
  download?: (blob: Blob, fileName: string) => void;
}

/** Saves the blob as a file through a temporary `<a download>` link. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke after a tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const isAbort = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';

/**
 * Opens the system share sheet with the card PNG when sharing files is supported,
 * otherwise (or when sharing fails) downloads it. A user cancel does nothing.
 * Call it straight from the tap: `share` needs transient user activation.
 */
export async function shareCardImage(blob: Blob, deps: ShareDeps = {}): Promise<ShareOutcome> {
  const nav: ShareNavigator = deps.navigator ?? navigator;
  const download = deps.download ?? downloadBlob;
  const file = new File([blob], CARD_FILE_NAME, { type: 'image/png' });
  const data: ShareData = { files: [file], title: SHARE_TITLE, text: SHARE_TEXT };

  if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
    }
  }
  download(blob, CARD_FILE_NAME);
  return 'downloaded';
}
