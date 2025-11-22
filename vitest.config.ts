import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/git/**/*.test.ts'],
    environment: 'node',
    testTimeout: 300,
  },
});
