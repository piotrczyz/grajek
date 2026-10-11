import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { weekDays } from '../practice/week.ts';
import type { CardModel } from './cardModel.ts';
import type { ShareOutcome } from './shareCard.ts';
import { ShareCardButton } from './ShareCardButton.tsx';

const DAYS = weekDays(new Date(2026, 9, 14, 10, 0));
const BLOB = new Blob(['png'], { type: 'image/png' });

const button = () => screen.getByRole('button', { name: 'Pokaż rodzinie' });

function setup(
  musicDays: string[],
  render$: (model: CardModel) => Promise<Blob> = async () => BLOB,
  share: (blob: Blob) => Promise<ShareOutcome> = async () => 'shared',
) {
  const renderFn = vi.fn(render$);
  const shareFn = vi.fn(share);
  render(
    <ShareCardButton
      days={DAYS}
      musicDays={new Set(musicDays)}
      instrumentName="Skrzypce"
      render={renderFn}
      share={shareFn}
    />,
  );
  return { renderFn, shareFn };
}

describe('ShareCardButton', () => {
  it('is hidden when the week has no music day', () => {
    setup(['2026-10-01']);
    expect(screen.queryByRole('button', { name: 'Pokaż rodzinie' })).not.toBeInTheDocument();
  });

  it('renders the card from the week data and then shares it', async () => {
    const { renderFn, shareFn } = setup([DAYS[0], DAYS[4]]);
    fireEvent.click(button());
    await vi.waitFor(() => expect(shareFn).toHaveBeenCalledWith(BLOB));
    expect(renderFn).toHaveBeenCalledTimes(1);
    const model = renderFn.mock.calls[0][0];
    expect(model.headline).toBe('2 dni z muzyką w tym tygodniu');
    expect(model.instrumentName).toBe('Skrzypce');
    expect(model.week.map((day) => day.music)).toEqual([true, false, false, false, true, false, false]);
    expect(renderFn.mock.invocationCallOrder[0]).toBeLessThan(shareFn.mock.invocationCallOrder[0]);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows the download message when the image was downloaded', async () => {
    setup([DAYS[1]], undefined, async () => 'downloaded');
    fireEvent.click(button());
    expect(await screen.findByText('Obrazek zapisany.')).toBeInTheDocument();
  });

  it('stays silent when the user cancels sharing', async () => {
    const { shareFn } = setup([DAYS[1]], undefined, async () => 'cancelled');
    fireEvent.click(button());
    await vi.waitFor(() => expect(button()).toBeEnabled());
    expect(shareFn).toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows the retry message when rendering fails', async () => {
    const { shareFn } = setup([DAYS[1]], async () => {
      throw new Error('no canvas');
    });
    fireEvent.click(button());
    expect(await screen.findByText('Ups, coś nie wyszło. Spróbuj jeszcze raz!')).toBeInTheDocument();
    expect(shareFn).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
  });

  it('is disabled while the card is being generated', async () => {
    let finish: (blob: Blob) => void = () => {};
    const { renderFn } = setup([DAYS[1]], () => new Promise<Blob>((resolve) => (finish = resolve)));
    fireEvent.click(button());
    expect(button()).toBeDisabled();
    fireEvent.click(button());
    expect(renderFn).toHaveBeenCalledTimes(1);
    await act(async () => finish(BLOB));
    expect(button()).toBeEnabled();
  });
});
