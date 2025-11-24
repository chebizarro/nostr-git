import { defineConfig } from 'vitest/config'

// Local Vitest config for @nostr-git/shared-types so it does not
// inherit the monorepo git test pattern (test/git/**/*.test.ts).
// We only want to run this package's own spec files under tests/.
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
  },
})
