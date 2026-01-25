import { describe, it, expect, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Capture the exposed API from the worker via comlink.expose
let exposed: any;
vi.mock('comlink', () => ({
  expose: (obj: any) => {
    exposed = obj;
  },
}));

// Mock Git provider used by the worker
vi.mock('../../src/git/factory-browser.js', () => ({
  createGitProvider: () => ({
    push: vi.fn(async () => undefined),
    resolveRef: vi.fn(async () => 'abc123def456'),
    // Other methods may be referenced in unrelated API paths but are not invoked here
    statusMatrix: vi.fn(async () => []),
    log: vi.fn(async () => []),
    listBranches: vi.fn(async () => ['main']),
  }),
}));

// Mock provider FS accessor to a minimal FS
vi.mock('../../src/worker/workers/fs-utils.js', () => ({
  getProviderFs: (_g: any) => ({ promises: { stat: async () => ({}) } }),
  isRepoClonedFs: async (_g: any, _d: string) => true,
}));

// Default mock for getNostrGitProvider is undefined; individual tests will override
vi.mock('../../src/api/git-provider.js', () => ({
  getNostrGitProvider: () => undefined,
  initializeNostrGitProvider: () => {},
}));

// Import the worker module AFTER mocks so comlink.expose is intercepted
await import('../../src/worker/worker.js');

describe('worker.pushToRemote API', () => {
  it('uses Nostr provider path and propagates blossomSummary when available', async () => {
    // Arrange: install a nostr provider that returns a blossomSummary
    const summary = { uploaded: 3, failures: [] } as any;
    const pushSpy = vi.fn(async () => ({ blossomSummary: summary }));
    const mod = await import('../../src/api/git-provider.js');
    (mod as any).getNostrGitProvider = () => ({ push: pushSpy });

    // Act: call pushToRemote on exposed API
    // Don't pass 'grasp' as provider - that triggers a different code path requiring token
    // Instead, let it use the NostrGitProvider path which is checked after GRASP
    const res = await exposed.pushToRemote({
      repoId: 'owner/repo',
      remoteUrl: 'https://example.com/owner/repo.git',
      branch: 'main',
    });

    // Assert
    expect(res.success).toBe(true);
    expect(res.branch).toBe('main');
    expect(res.blossomSummary).toEqual(summary);
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to git.push when no Nostr provider and returns success without blossomSummary', async () => {
    // Arrange: ensure getNostrGitProvider returns undefined
    const mod = await import('../../src/api/git-provider.js');
    (mod as any).getNostrGitProvider = () => undefined;

    // Act
    const res = await exposed.pushToRemote({
      repoId: 'owner/repo',
      remoteUrl: 'https://example.com/owner/repo.git',
      branch: 'main',
    });

    // Assert
    expect(res.success).toBe(true);
    expect(res.branch).toBe('main');
    expect(res.blossomSummary).toBeUndefined();
  });
});
