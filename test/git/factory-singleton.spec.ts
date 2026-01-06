import { describe, it, expect, vi } from 'vitest';
import 'fake-indexeddb/auto';

describe('git/factory getGitProvider', () => {
  it('returns singleton instance across calls', async () => {
    vi.resetModules();
    const { getGitProvider } = await import('../../src/git/factory.js');
    const a = getGitProvider({ cacheMode: 'off' });
    const b = getGitProvider({ cacheMode: 'off' });
    expect(a).toBe(b);
  });

  it('honors cacheMode=off => IsomorphicGitProvider instance', async () => {
    vi.resetModules();
    const { getGitProvider } = await import('../../src/git/factory.js');
    const { IsomorphicGitProvider } = await import('../../src/git/isomorphic-git-provider.js');
    const p = getGitProvider({ cacheMode: 'off' });
    expect(p instanceof IsomorphicGitProvider).toBe(true);
  });

  it('default cache mode wraps Isomorphic in CachedGitProvider', async () => {
    vi.resetModules();
    const { getGitProvider } = await import('../../src/git/factory.js');
    const { CachedGitProvider } = await import('../../src/git/cached-provider.js');
    const { IsomorphicGitProvider } = await import('../../src/git/isomorphic-git-provider.js');
    const p = getGitProvider();
    expect(p instanceof CachedGitProvider).toBe(true);
    // baseProvider should be an IsomorphicGitProvider
    expect((p as any).baseProvider instanceof IsomorphicGitProvider).toBe(true);
  });
});
