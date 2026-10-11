import { describe, expect, it, vi } from 'vitest';
import { weekDays } from '../practice/week.ts';
import { buildCardModel } from './cardModel.ts';
import { CARD_SIZE, drawCard, renderCardPng } from './renderCard.ts';

const DAYS = weekDays(new Date(2026, 9, 14, 10, 0));
const MODEL = buildCardModel({
  days: DAYS,
  musicDays: new Set([DAYS[0], DAYS[2], DAYS[3], DAYS[5]]),
  instrumentName: 'Pianino',
});

/** A recording stand-in for CanvasRenderingContext2D (jsdom has no canvas). */
function fakeContext() {
  const texts: string[] = [];
  let rects = 0;
  const ctx = {
    fillStyle: '',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    fillRect: vi.fn(),
    fillText: vi.fn((text: string) => texts.push(text)),
    beginPath: vi.fn(() => {
      rects += 1;
    }),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
  };
  return { ctx, texts, cells: () => rects };
}

function fakeCanvas(ctx: unknown, blob: Blob | null = new Blob(['png'], { type: 'image/png' })) {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((callback: BlobCallback, type?: string) => {
      expect(type).toBe('image/png');
      callback(blob);
    }),
  };
}

describe('drawCard', () => {
  it('writes the title, instrument and headline and draws 7 day cells', () => {
    const { ctx, texts, cells } = fakeContext();
    drawCard(ctx as unknown as CanvasRenderingContext2D, MODEL);
    expect(texts).toContain('Grajek');
    expect(texts).toContain('Pianino');
    expect(texts).toContain('🎹');
    expect(texts).toContain('4 dni z muzyką w tym tygodniu');
    expect(texts).toContain('Ćwiczę dla siebie!');
    expect(cells()).toBe(7);
    expect(ctx.fill).toHaveBeenCalledTimes(7);
    for (const short of ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd']) expect(texts).toContain(short);
    expect(texts.filter((text) => text === '♪')).toHaveLength(4);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, CARD_SIZE, CARD_SIZE);
  });

  it('never writes a profile name', () => {
    const { ctx, texts } = fakeContext();
    drawCard(ctx as unknown as CanvasRenderingContext2D, MODEL);
    expect(texts.join(' ')).not.toMatch(/Ola|Cześć/);
  });
});

describe('renderCardPng', () => {
  it('resolves the PNG blob from the injected canvas at full size', async () => {
    const { ctx, texts } = fakeContext();
    const blob = new Blob(['png'], { type: 'image/png' });
    const canvas = fakeCanvas(ctx, blob);
    await expect(renderCardPng(MODEL, () => canvas as unknown as HTMLCanvasElement)).resolves.toBe(blob);
    expect(canvas.width).toBe(CARD_SIZE);
    expect(canvas.height).toBe(CARD_SIZE);
    expect(canvas.getContext).toHaveBeenCalledWith('2d');
    expect(texts).toContain(MODEL.headline);
  });

  it('rejects when the 2D context is not available', async () => {
    const canvas = fakeCanvas(null);
    await expect(renderCardPng(MODEL, () => canvas as unknown as HTMLCanvasElement)).rejects.toThrow();
    expect(canvas.toBlob).not.toHaveBeenCalled();
  });

  it('rejects when the image cannot be encoded', async () => {
    const { ctx } = fakeContext();
    const canvas = fakeCanvas(ctx, null);
    await expect(renderCardPng(MODEL, () => canvas as unknown as HTMLCanvasElement)).rejects.toThrow();
  });
});
