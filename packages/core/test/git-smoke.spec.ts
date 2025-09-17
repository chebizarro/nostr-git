import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Smoke test uses Vitest aliases for isomorphic-git and friends (see vitest.config.ts)
describe('git provider smoke', () => {
  it('init + version + statusMatrix should work', async () => {
    const { getGitProvider } = await import('../src/lib/git-provider.js');
    const git = getGitProvider();
    const isBrowserLike =
      typeof window !== 'undefined' && typeof (globalThis as any).indexedDB !== 'undefined';
    const dir = isBrowserLike ? '/smoke-repo' : mkdtempSync(join(tmpdir(), 'nostr-git-smoke-'));

    await git.init({ dir });
    const v = await git.version();
    expect(typeof v === 'string' || typeof v === 'number').toBeTruthy();

    const matrix = await git.statusMatrix({ dir });
    expect(Array.isArray(matrix)).toBe(true);
  });
});
