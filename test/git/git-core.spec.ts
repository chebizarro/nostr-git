import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

import { detectDefaultBranch, resolveBranchToOid, ensureRepoFromEvent, fetchPermalink } from '../../src/git/git.js';

vi.mock('../../src/api/git-provider.js', () => {
  const state: any = { git: null };
  return {
    getGitProvider: () => state.git,
    __setGit: (g: any) => { state.git = g; }
  };
});

const { __setGit } = await import('../../src/api/git-provider.js' as any);

describe('git core helpers (strict behavior)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('detectDefaultBranch: prefers HEAD symbolic refs; falls back to common names; ultimate fallback main', async () => {
    // Case 1: HEAD is symbolic
    __setGit({
      resolveRef: vi.fn(async () => 'refs/heads/feature'),
      listRefs: vi.fn(async () => [])
    });
    const repoEvent: any = { repoId: 'owner/repo', clone: [] };
    await expect(detectDefaultBranch(repoEvent)).resolves.toBe('feature');

    // Case 2: HEAD not symbolic, listRefs contains main
    __setGit({
      resolveRef: vi.fn(async () => 'deadbeef'),
      listRefs: vi.fn(async () => [{ ref: 'refs/heads/main' }])
    });
    await expect(detectDefaultBranch(repoEvent)).resolves.toBe('main');

    // Case 3: throws -> fallback 'main'
    __setGit({
      resolveRef: vi.fn(async () => { throw new Error('not found'); }),
      listRefs: vi.fn(async () => [])
    });
    await expect(detectDefaultBranch(repoEvent)).resolves.toBe('main');
  });

  it('resolveBranchToOid: tries preferred then common names and returns on first success', async () => {
    const calls: string[] = [];
    const git = {
      resolveRef: vi.fn(async ({ ref }: any) => {
        calls.push(ref);
        if (ref === 'feat') throw new Error('no');
        if (ref === 'main') return '0123456789abcdef';
        throw new Error('no');
      })
    } as any;
    const oid = await resolveBranchToOid(git, '/r', 'feat');
    expect(oid.startsWith('01234567')).toBe(true);
    expect(calls[0]).toBe('feat');
    expect(calls).toContain('main');
  });

  it('resolveBranchToOid: throws wrapped error when all attempts fail', async () => {
    const git = { resolveRef: vi.fn(async () => { throw new Error('missing'); }) } as any;
    await expect(resolveBranchToOid(git, '/r', 'nope')).rejects.toThrow();
  });

  it('ensureRepoFromEvent: converts SSH clone URL to https and calls clone', async () => {
    const clone = vi.fn(async () => undefined);
    const fetch = vi.fn(async () => undefined);
    __setGit({
      resolveRef: vi.fn(async () => { throw new Error('no HEAD'); }), // make isRepoCloned=false
      clone,
      fetch,
      deleteRef: vi.fn(async () => undefined),
    });
    const repoEvent: any = { repoId: 'owner/repo', clone: ['git@github.com:owner/repo.git'] };
    await ensureRepoFromEvent({ repoEvent });
    expect(clone).toHaveBeenCalled();
    const arg = (clone as any).mock.calls[0][0];
    expect(arg.url).toBe('https://github.com/owner/repo.git');
  });

  it('ensureRepoFromEvent: throws when no supported clone URL', async () => {
    __setGit({ resolveRef: vi.fn(async () => { throw new Error('no'); }) });
    const repoEvent: any = { repoId: 'owner/repo', clone: ['ssh://invalid'] };
    await expect(ensureRepoFromEvent({ repoEvent })).rejects.toThrow(/No supported clone URL/);
  });

  it('fetchPermalink: returns sliced content or error string', async () => {
    __setGit({
      resolveRef: vi.fn(async () => 'commit1'),
      readBlob: vi.fn(async () => ({ blob: new TextEncoder().encode('a\nb\nc\n') })),
      clone: vi.fn(async () => undefined),
      fetch: vi.fn(async () => undefined),
      deleteRef: vi.fn(async () => undefined),
    });
    const data: any = { host: 'example.com', owner: 'o', repo: 'r', branch: 'main', filePath: 'f', startLine: 2, endLine: 3 };
    await expect(fetchPermalink(data)).resolves.toBe('b\nc');

    // error case (readBlob throws)
    __setGit({
      resolveRef: vi.fn(async () => 'commit1'),
      readBlob: vi.fn(async () => { throw new Error('deny'); }),
      clone: vi.fn(async () => undefined),
      fetch: vi.fn(async () => undefined),
      deleteRef: vi.fn(async () => undefined),
    });
    const err = await fetchPermalink(data);
    expect(String(err)).toMatch(/^Error:/);
  });
});
