import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './index.css';
import { requestPersistentStorage } from './storage/index.ts';

// Best effort, fire-and-forget: never blocks or breaks rendering.
void requestPersistentStorage();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
