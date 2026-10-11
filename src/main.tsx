import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.tsx';
import './index.css';
import { requestPersistentStorage } from './storage/index.ts';

// Best effort, fire-and-forget: never blocks or breaks rendering.
void requestPersistentStorage();

// The service worker precaches the app shell so it opens offline. It exists only
// in the production build; autoUpdate swaps in a new version on the next load.
if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
