import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default to using stubbed modules during tests unless explicitly disabled
const useStubs = process.env.USE_STUBS !== 'false';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 2000,
    setupFiles: ['test/setup.ts'],
    exclude: [
      'test/retry/**',
      'test/**/git-smoke.spec.ts',
      'test/workers/**',
      'test/**/nostr-git-provider.spec.ts',
      'test/**/provider-merge-metadata.spec.ts',
      'test/**/analyze-merge-metadata.spec.ts',
      'test/**/apply-patch-util.spec.ts',
      'test/**/multi-file-patch.spec.ts',
      'test/**/multihunk-modify.spec.ts',
      'test/**/patches-util.spec.ts',
      'test/**/push-util.spec.ts',
      'test/**/repos-utils.spec.ts',
      'test/**/sync-utils.spec.ts',
      'test/**/keys/normalize.spec.ts',
      '**/node_modules/**',
      '**/dist/**',
      '**/__stubs__/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90
      },
      exclude: [
        'test/**',
        'dist/**',
        '**/*.spec.ts',
        '**/__stubs__/**',
        '**/node_modules/**'
      ]
    }
  },
  // Ensure Vite transforms git-wrapper so our aliases apply to its imports
  ssr: {
    noExternal: ['@nostr-git/git-wrapper']
  },
  resolve: {
    alias: useStubs
      ? {
          'isomorphic-git': resolve(__dirname, 'test/__stubs__/isomorphic-git.ts'),
          'isomorphic-git/http/web': resolve(__dirname, 'test/__stubs__/http-web.ts'),
          'isomorphic-git/http/node': resolve(__dirname, 'test/__stubs__/http-web.ts'),
          '@isomorphic-git/lightning-fs': resolve(__dirname, 'test/__stubs__/lightning-fs.ts')
        }
      : {}
  }
});
