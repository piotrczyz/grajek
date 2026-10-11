import { defineConfig } from 'vitest/config';

// Integration tests against the Functions + Firestore emulators.
// Run only through `pnpm test:emulators` (firebase emulators:exec, project demo-grajek).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test-emulator/**/*.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
