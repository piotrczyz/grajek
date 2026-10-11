import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { downloadBlob, shareCardImage } from './shareCard.ts';

const BLOB = new Blob(['png'], { type: 'image/png' });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shareCardImage', () => {
  it('shares a PNG file named karta-postepu.png when file sharing is supported', async () => {
    const share = vi.fn(async (data: ShareData) => {
      void data;
    });
    const canShare = vi.fn(() => true);
    const download = vi.fn();
    await expect(shareCardImage(BLOB, { navigator: { share, canShare }, download })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    const files = share.mock.calls[0][0].files ?? [];
    expect(files).toHaveLength(1);
    expect(files[0]).toBeInstanceOf(File);
    expect(files[0].name).toBe('karta-postepu.png');
    expect(files[0].type).toBe('image/png');
    expect(download).not.toHaveBeenCalled();
  });

  it('does nothing when the user cancels the share sheet', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError');
    });
    const download = vi.fn();
    await expect(
      shareCardImage(BLOB, { navigator: { share, canShare: () => true }, download }),
    ).resolves.toBe('cancelled');
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    ['share is missing', { canShare: (): boolean => true }],
    ['canShare is missing', { share: async () => {} }],
    ['canShare returns false', { share: async () => {}, canShare: () => false }],
    [
      'share fails with another error',
      {
        share: async () => {
          throw new DOMException('denied', 'NotAllowedError');
        },
        canShare: () => true,
      },
    ],
  ])('downloads the image when %s', async (_, nav) => {
    const download = vi.fn();
    await expect(shareCardImage(BLOB, { navigator: nav, download })).resolves.toBe('downloaded');
    expect(download).toHaveBeenCalledWith(BLOB, 'karta-postepu.png');
  });
});

describe('downloadBlob', () => {
  it('clicks a temporary download link and revokes the URL afterwards', async () => {
    vi.useFakeTimers();
    // jsdom has no object URLs; install stand-ins and put the originals back afterwards.
    const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
    const createObjectURL = vi.fn(() => 'blob:card');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    onTestFinished(() => {
      URL.createObjectURL = original.create;
      URL.revokeObjectURL = original.revoke;
      vi.useRealTimers();
    });
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });

    downloadBlob(BLOB, 'karta-postepu.png');

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('karta-postepu.png');
    expect(clicked[0].getAttribute('href')).toBe('blob:card');
    expect(clicked[0].isConnected).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:card');
  });
});
