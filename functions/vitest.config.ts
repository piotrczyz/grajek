import { defineConfig } from 'vitest/config';

// Unit tests only: in-memory fakes, no emulator, no network.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
