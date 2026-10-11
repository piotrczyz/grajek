import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './index.css';
import { registerAppUpdates } from './pwa/index.ts';
import { requestPersistentStorage } from './storage/index.ts';

// Best effort, fire-and-forget: never blocks or breaks rendering.
void requestPersistentStorage();

// The service worker precaches the app shell so it opens offline. It exists only
// in the production build. registerAppUpdates also asks for a new version on every
// return to the foreground and every 15 minutes, and reloads onto it unless a form
// holds unsaved input (then a "Jest nowa wersja" bar offers the reload).
if (import.meta.env.PROD) {
  registerAppUpdates();
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
