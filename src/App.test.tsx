import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.tsx';

describe('welcome screen', () => {
  it('shows the Grajek heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Grajek' })).toBeInTheDocument();
  });

  it('greets the student in Polish', () => {
    render(<App />);
    expect(
      screen.getByText('Cześć! Tu zapiszesz swoje ćwiczenia na instrumencie.'),
    ).toBeInTheDocument();
  });
});
