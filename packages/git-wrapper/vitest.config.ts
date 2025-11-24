import { defineConfig } from 'vitest/config'

// Local Vitest config for @nostr-git/git-wrapper so it does not
// inherit the monorepo git test pattern (test/git/**/*.test.ts).
// This package currently has tests under __tests__/ and test/.
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts', 'test/**/*.spec.ts', 'test/**/*.test.ts'],
  },
})
