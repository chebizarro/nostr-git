import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import {
  clearCloneTracking,
  initializeRepoUtil,
  ensureShallowCloneUtil,
  ensureFullCloneUtil,
  smartInitializeRepoUtil,
} from '../../src/worker/workers/repos.js';

function makeCache() {
  let cache: any | null = null;
  return {
    obj: {
      async init() {},
      async getRepoCache(key: string) { return cache && cache.repoId === key ? cache : null; },
      async setRepoCache(c: any) { cache = c; },
    },
    set(c: any) { cache = c; },
    get() { return cache; },
  };
}

function makeGit(overrides: any = {}) {
  return {
    async listBranches() { return overrides.branches ?? ['main']; },
    async resolveRef({ ref }: any) { return overrides.refs?.[ref] ?? 'deadbeef'.padEnd(40, '0'); },
    async listRemotes() { return overrides.remotes ?? [{ remote: 'origin', url: 'https://example.com/x/y.git' }]; },
    async fetch() { if (overrides.fetchErr) throw new Error(overrides.fetchErr); },
    async clone() { if (overrides.cloneErr) throw new Error(overrides.cloneErr); },
    async checkout() {},
    async writeRef() {},
    async listServerRefs({ url }: any) { if (overrides.noRefs) return []; return [{ ref: 'refs/heads/main' }]; },
  } as any;
}

describe('worker/repos quick tests', () => {
  it('clearCloneTracking empties sets and maps', () => {
    const set = new Set(['a']);
    const map = new Map([['k', 'refs']]);
    clearCloneTracking(set, map as any);
    expect(set.size).toBe(0);
    expect(map.size).toBe(0);
  });

  it('ensureShallowCloneUtil returns not initialized when repo missing', async () => {
    const git = makeGit();
    const res = await ensureShallowCloneUtil(
      git,
      { repoId: 'owner/name' },
      {
        rootDir: '/root',
        canonicalRepoKey: (id: string) => id.replace('/', ':'),
        repoDataLevels: new Map(),
        clonedRepos: new Set(),
        isRepoCloned: async () => false,
        resolveRobustBranch: async () => 'main',
      },
      () => {}
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Repository not initialized/);
  });

  it('initializeRepoUtil returns corsError payload when clone fails due to CORS', async () => {
    const git = makeGit({ cloneErr: 'CORS blocked' });
    const cache = makeCache();
    const res = await initializeRepoUtil(
      git,
      cache.obj as any,
      { repoId: 'owner/name', cloneUrls: ['https://example.com/owner/name.git'] },
      {
        rootDir: '/root',
        canonicalRepoKey: (id: string) => id.replace('/', ':'),
        repoDataLevels: new Map(),
        clonedRepos: new Set(),
      },
      () => {}
    );
    expect(res.success).toBe(false);
    expect((res as any).corsError).toBe(true);
    expect(String((res as any).error)).toMatch(/CORS\/network/);
  });

  it('smartInitializeRepoUtil returns cached data without hitting git when cache exists', async () => {
    const git = makeGit();
    const cache = makeCache();
    const key = 'owner:name';
    cache.set({
      repoId: key,
      dataLevel: 'refs',
      headCommit: 'deadbeef'.padEnd(40, '0'),
      branches: [{ name: 'main', commit: 'deadbeef'.padEnd(40, '0') }],
      cloneUrls: ['https://example.com/owner/name.git'],
      lastUpdated: Date.now(),
    });
    const res = await smartInitializeRepoUtil(
      git,
      cache.obj as any,
      { repoId: 'owner/name', cloneUrls: ['https://example.com/owner/name.git'] },
      {
        rootDir: '/root',
        canonicalRepoKey: (id: string) => id.replace('/', ':'),
        repoDataLevels: new Map(),
        clonedRepos: new Set(),
        isRepoCloned: async () => true,
        resolveRobustBranch: async () => 'main',
      },
      () => {}
    );
    expect(res.success).toBe(true);
    expect((res as any).fromCache).toBe(true);
    expect((res as any).branches?.[0]?.name).toBe('main');
  });

  it('ensureShallowCloneUtil happy path fetches and checks out branch', async () => {
    const git = makeGit();
    const repoDataLevels = new Map<string, any>();
    const res = await ensureShallowCloneUtil(
      git,
      { repoId: 'owner/name' },
      {
        rootDir: '/root',
        canonicalRepoKey: (id: string) => id.replace('/', ':'),
        repoDataLevels,
        clonedRepos: new Set(['owner:name']),
        isRepoCloned: async () => true,
        resolveRobustBranch: async () => 'main',
      },
      () => {}
    );
    expect(res.success).toBe(true);
    expect(res.dataLevel).toBe('shallow');
  });

  it('ensureFullCloneUtil returns cached=true when already full', async () => {
    const git = makeGit();
    const repoDataLevels = new Map<string, any>([['owner:name', 'full']]);
    const res = await ensureFullCloneUtil(
      git,
      { repoId: 'owner/name' },
      {
        rootDir: '/root',
        canonicalRepoKey: (id: string) => id.replace('/', ':'),
        repoDataLevels,
        clonedRepos: new Set(['owner:name']),
        isRepoCloned: async () => true,
        resolveRobustBranch: async () => 'main',
      },
      () => {}
    );
    expect(res.success).toBe(true);
    expect((res as any).cached).toBe(true);
    expect((res as any).level).toBe('full');
  });

  it('ensureFullCloneUtil fetch success marks level full', async () => {
    const git = makeGit();
    const repoDataLevels = new Map<string, any>([['owner:name', 'refs']]);
    const res = await ensureFullCloneUtil(
      git,
      { repoId: 'owner/name', depth: 20 },
      {
        rootDir: '/root',
        canonicalRepoKey: (id: string) => id.replace('/', ':'),
        repoDataLevels,
        clonedRepos: new Set(['owner:name']),
        isRepoCloned: async () => true,
        resolveRobustBranch: async () => 'main',
      },
      () => {}
    );
    expect(res.success).toBe(true);
    expect((res as any).level).toBe('full');
  });

  it('ensureFullCloneUtil reports error when origin remote missing', async () => {
    const git = makeGit({ remotes: [] });
    const repoDataLevels = new Map<string, any>([['owner:name', 'refs']]);
    const res = await ensureFullCloneUtil(
      git,
      { repoId: 'owner/name' },
      {
        rootDir: '/root',
        canonicalRepoKey: (id: string) => id.replace('/', ':'),
        repoDataLevels,
        clonedRepos: new Set(['owner:name']),
        isRepoCloned: async () => true,
        resolveRobustBranch: async () => 'main',
      },
      () => {}
    );
    expect(res.success).toBe(false);
    expect(String((res as any).error)).toMatch(/Origin remote not found/);
  });
});
