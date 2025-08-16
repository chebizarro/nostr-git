import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const useStubs = process.env.USE_STUBS === 'true';

export default defineConfig({
  test: {
    environment: 'node',
  },
  // Ensure Vite transforms git-wrapper so our aliases apply to its imports
  ssr: {
    noExternal: ['@nostr-git/git-wrapper'],
  },
  resolve: {
    alias: useStubs
      ? {
          'isomorphic-git': resolve(__dirname, 'test/__stubs__/isomorphic-git.ts'),
          'isomorphic-git/http/web': resolve(__dirname, 'test/__stubs__/http-web.ts'),
          '@isomorphic-git/lightning-fs': resolve(__dirname, 'test/__stubs__/lightning-fs.ts'),
        }
      : {},
  },
});
