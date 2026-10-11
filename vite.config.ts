/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Matches the welcome screen background so the Android splash and iOS status bar blend in.
const THEME_COLOR = '#1e3a8a';

export default defineConfig({
  // Relative base keeps the build host- and path-agnostic (deploy target is still open).
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: false,
      // globPatterns below already precache every file in dist/, icons included.
      includeManifestIcons: false,
      manifest: {
        id: './',
        name: 'Grajek',
        short_name: 'Grajek',
        description: 'Grajek – dziennik ćwiczeń na instrumencie dla uczniów szkół muzycznych.',
        lang: 'pl',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_COLOR,
        background_color: THEME_COLOR,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // manifest.webmanifest is added to the precache by the plugin itself.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // No runtimeCaching: the app makes no requests to external origins.
      },
    }),
  ],
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
