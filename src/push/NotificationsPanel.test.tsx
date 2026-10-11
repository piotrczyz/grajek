import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsPanel } from './NotificationsPanel.tsx';
import { TEXT } from './panel-text.ts';
import type { PushSupport, TestResult } from './push.ts';

const push = vi.hoisted(() => ({
  pushSupport: vi.fn<() => PushSupport>(),
  getRegistrationState: vi.fn(),
  enableNotifications: vi.fn(),
  disableNotifications: vi.fn(),
  sendTestNotification: vi.fn(),
}));

vi.mock('./push.ts', () => push);

function registered(value: boolean) {
  push.getRegistrationState.mockResolvedValue({
    deviceId: '3f2b8c1e-9d4a-4f6b-8a2e-1c5d7e9f0a1b',
    registered: value,
    updatedAt: 1,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  push.pushSupport.mockReturnValue('supported');
  registered(false);
});

describe('NotificationsPanel states', () => {
  it('supported and not registered: shows the enable button', async () => {
    render(<NotificationsPanel />);
    expect(await screen.findByRole('button', { name: TEXT.enable })).toBeEnabled();
    expect(screen.getByRole('heading', { level: 2, name: TEXT.heading })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: TEXT.test })).not.toBeInTheDocument();
  });

  it('registered: shows the test and disable buttons', async () => {
    registered(true);
    render(<NotificationsPanel />);
    expect(await screen.findByRole('button', { name: TEXT.test })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TEXT.disable })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: TEXT.enable })).not.toBeInTheDocument();
  });

  it('a device with no stored state counts as not registered', async () => {
    push.getRegistrationState.mockResolvedValue(null);
    render(<NotificationsPanel />);
    expect(await screen.findByRole('button', { name: TEXT.enable })).toBeInTheDocument();
  });

  it('needs-install: shows the home-screen hint and no button', () => {
    push.pushSupport.mockReturnValue('needs-install');
    render(<NotificationsPanel />);
    expect(screen.getByText(TEXT.needsInstall)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(push.getRegistrationState).not.toHaveBeenCalled();
  });

  it('denied: shows the settings hint and no button', () => {
    push.pushSupport.mockReturnValue('denied');
    render(<NotificationsPanel />);
    expect(screen.getByText(TEXT.denied)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('unsupported: renders nothing', () => {
    push.pushSupport.mockReturnValue('unsupported');
    const { container } = render(<NotificationsPanel />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('NotificationsPanel actions', () => {
  it('enabling switches to the registered buttons', async () => {
    push.enableNotifications.mockResolvedValue('enabled');
    render(<NotificationsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: TEXT.enable }));
    expect(await screen.findByRole('button', { name: TEXT.test })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(TEXT.enabled);
  });

  it('refusing permission shows the settings hint', async () => {
    push.enableNotifications.mockResolvedValue('denied');
    render(<NotificationsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: TEXT.enable }));
    expect(await screen.findByText(TEXT.denied)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('an enable error shows the error line and keeps the button', async () => {
    push.enableNotifications.mockResolvedValue('error');
    render(<NotificationsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: TEXT.enable }));
    expect(await screen.findByText(TEXT.error)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TEXT.enable })).toBeEnabled();
  });

  it.each([
    ['sent', TEXT.sent],
    ['cooldown', TEXT.cooldown],
    ['error', TEXT.error],
  ] as Array<[TestResult, string]>)(
    'test result %s shows one line and keeps the registered buttons',
    async (result, line) => {
      registered(true);
      push.sendTestNotification.mockResolvedValue(result);
      render(<NotificationsPanel />);
      fireEvent.click(await screen.findByRole('button', { name: TEXT.test }));
      expect(await screen.findByText(line)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: TEXT.test })).toBeEnabled();
    },
  );

  it('test result gone asks to turn it on again and shows the enable button', async () => {
    registered(true);
    push.sendTestNotification.mockResolvedValue('gone');
    render(<NotificationsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: TEXT.test }));
    expect(await screen.findByText(TEXT.gone)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TEXT.enable })).toBeInTheDocument();
  });

  it('disabling switches back to the enable button', async () => {
    registered(true);
    push.disableNotifications.mockResolvedValue('disabled');
    render(<NotificationsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: TEXT.disable }));
    expect(await screen.findByRole('button', { name: TEXT.enable })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(TEXT.disabled);
  });

  it('a disable error keeps the registered buttons', async () => {
    registered(true);
    push.disableNotifications.mockResolvedValue('error');
    render(<NotificationsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: TEXT.disable }));
    expect(await screen.findByText(TEXT.error)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: TEXT.disable })).toBeInTheDocument();
  });

  it('disables the buttons while a request is in flight', async () => {
    registered(true);
    let finish: (value: TestResult) => void = () => {};
    push.sendTestNotification.mockReturnValue(new Promise<TestResult>((r) => (finish = r)));
    render(<NotificationsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: TEXT.test }));
    expect(screen.getByRole('button', { name: TEXT.test })).toBeDisabled();
    expect(screen.getByRole('button', { name: TEXT.disable })).toBeDisabled();
    await act(async () => finish('sent'));
    expect(screen.getByRole('button', { name: TEXT.test })).toBeEnabled();
  });
});
