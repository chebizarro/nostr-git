import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        worker: resolve(__dirname, 'src/worker.ts')
      },
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`
    },
    rollupOptions: {
      external: [
        '@nostr-git/git-wrapper',
        '@nostr-git/shared-types',
        'axios',
        'buffer',
        'comlink',
        'diff',
        'file-type',
        'mime-types',
        'nostr-tools',
        'parse-diff',
        'parse-git-diff',
        'parse-patch'
      ],
      output: {
        globals: {
          '@nostr-git/git-wrapper': 'NostrGitWrapper',
          '@nostr-git/shared-types': 'NostrGitSharedTypes',
          'axios': 'Axios',
          'buffer': 'Buffer',
          'comlink': 'Comlink',
          'diff': 'Diff',
          'file-type': 'FileType',
          'mime-types': 'MimeTypes',
          'nostr-tools': 'NostrTools',
          'parse-diff': 'ParseDiff',
          'parse-git-diff': 'ParseGitDiff',
          'parse-patch': 'ParsePatch'
        }
      }
    },
    target: 'esnext',
    minify: false,
    sourcemap: true
  },
  define: {
    global: 'globalThis',
    __PRODUCTION__: JSON.stringify(process.env.NODE_ENV === "production"),
    __DEVELOPMENT__: JSON.stringify(process.env.NODE_ENV !== "production"),
    __GRASP__: JSON.stringify(process.env.FEATURE_GRASP !== "0"),
    __NIP34_PR__: JSON.stringify(process.env.FEATURE_NIP34_PR === "1"),
    __CICD__: JSON.stringify(process.env.FEATURE_CICD === "1"),
    __TERMINAL__: JSON.stringify(process.env.FEATURE_TERMINAL !== "0"),
    __STRICT_NIP29__: JSON.stringify(process.env.FEATURE_STRICT_NIP29 === "1"),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  worker: {
    format: 'es'
  }
});
