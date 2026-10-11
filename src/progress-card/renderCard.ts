import type { CardModel } from './cardModel.ts';

/** The card is a square PNG, CARD_SIZE pixels on each side. */
export const CARD_SIZE = 1080;

const BACKGROUND = '#1e3a8a';
const TEXT = '#ffffff';
const MUSIC_DAY = '#fcd34d';
const MUSIC_DAY_TEXT = '#172554';
const EMPTY_DAY = 'rgba(255, 255, 255, 0.12)';
const ACCENT = '#fcd34d';
// System fonts and the instrument emoji only: nothing is fetched, so it works offline.
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const font = (weight: number, size: number, family = FONT) => `${weight} ${size}px ${family}`;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** Draws the Progress Card onto a CARD_SIZE x CARD_SIZE 2D context. */
export function drawCard(ctx: CanvasRenderingContext2D, model: CardModel): void {
  const center = CARD_SIZE / 2;

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = ACCENT;
  ctx.font = font(800, 64);
  ctx.fillText(model.title, center, 100);

  ctx.font = font(400, 180, EMOJI_FONT);
  ctx.fillText(model.instrumentIcon, center, 280);

  ctx.fillStyle = TEXT;
  ctx.font = font(700, 64);
  ctx.fillText(model.instrumentName, center, 440, CARD_SIZE - 120);

  ctx.font = font(800, 60);
  ctx.fillText(model.headline, center, 560, CARD_SIZE - 80);

  // The week row: 7 cells, music days amber with a note, empty days neutral.
  const gap = 16;
  const margin = 80;
  const cell = (CARD_SIZE - margin * 2 - gap * 6) / 7;
  const top = 650;
  const height = cell * 1.4;
  model.week.forEach((day, index) => {
    const x = margin + index * (cell + gap);
    ctx.fillStyle = day.music ? MUSIC_DAY : EMPTY_DAY;
    roundedRect(ctx, x, top, cell, height, 24);
    ctx.fill();
    ctx.fillStyle = day.music ? MUSIC_DAY_TEXT : TEXT;
    ctx.font = font(800, 44);
    ctx.fillText(day.short, x + cell / 2, top + height * 0.32);
    if (day.music) {
      ctx.font = font(800, 56);
      ctx.fillText('♪', x + cell / 2, top + height * 0.7);
    }
  });

  ctx.fillStyle = ACCENT;
  ctx.font = font(800, 60);
  ctx.fillText(model.cheer, center, 980, CARD_SIZE - 80);
}

const createDefaultCanvas = () => document.createElement('canvas');

/** Draws the card on a fresh canvas and resolves its PNG. */
export function renderCardPng(
  model: CardModel,
  createCanvas: () => HTMLCanvasElement = createDefaultCanvas,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = createCanvas();
    canvas.width = CARD_SIZE;
    canvas.height = CARD_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas 2D is not available'));
      return;
    }
    drawCard(ctx, model);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The card image could not be encoded'));
    }, 'image/png');
  });
}
