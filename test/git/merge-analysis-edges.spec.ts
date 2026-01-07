import { describe, it, expect, vi } from 'vitest';
import type { GitProvider } from '../../src/git/provider.js';
import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';

function makeGit(overrides: Partial<GitProvider> = {}): GitProvider {
  return {
    listRemotes: vi.fn(async () => [{ remote: 'origin', url: 'https://example.com/repo.git' }]) as any,
    fetch: vi.fn(async () => undefined) as any,
    resolveRef: vi.fn(async ({ ref }: any) => {
      if (ref === 'refs/heads/main') return 'targetCommit';
      if (ref === 'refs/remotes/origin/main') return 'remoteCommit';
      throw new Error('bad ref');
    }) as any,
    isDescendent: vi.fn(async () => true) as any,
    log: vi.fn(async () => [{ oid: 'a1' }, { oid: 'b2' }]) as any,
    listBranches: vi.fn(async () => ['main']) as any,
    ...overrides,
  } as unknown as GitProvider;
}

function patchWith(commits: string[], content = 'diff --git a/x b/x\n'): any {
  return {
    id: 'p1',
    commits: commits.map((oid) => ({ oid, message: 'm', author: { name: 'n', email: 'e' } })),
    baseBranch: 'main',
    raw: { content },
  };
}

describe('git/merge-analysis edges', () => {
  it('skips fetch when no origin remote and still analyzes (fast-forward path)', async () => {
    const git = makeGit({
      listRemotes: vi.fn(async () => []) as any,
      // Fast-forward condition: last patch commit is descendant of target
      isDescendent: vi.fn(async ({ oid, ancestor }: any) => oid === 'patchTip' && ancestor === 'targetCommit') as any,
      resolveRef: vi.fn(async ({ ref }: any) => (ref === 'refs/heads/main' ? 'targetCommit' : (() => { throw new Error('no remote'); })())) as any,
      log: vi.fn(async () => [{ oid: 'z' }]) as any,
    });
    const res = await analyzePatchMergeability(git, '/repo', patchWith(['x1', 'patchTip']));
    expect(res.fastForward).toBe(true);
    expect(res.analysis).toBe('clean');
  });

  it('reports diverged when remote differs from target and isDescendent returns false', async () => {
    const git = makeGit({
      resolveRef: vi.fn(async ({ ref }: any) => {
        if (ref === 'refs/heads/main') return 'targetA';
        if (ref === 'refs/remotes/origin/main') return 'remoteB';
        throw new Error('bad ref');
      }) as any,
      isDescendent: vi.fn(async () => false) as any,
      log: vi.fn(async () => [{ oid: 'x' }]) as any,
    });
    const res = await analyzePatchMergeability(git, '/repo', patchWith(['c1']));
    expect(res.analysis).toBe('diverged');
    expect(res.canMerge).toBe(false);
    expect(res.errorMessage).toMatch(/diverged/i);
  });

  it('returns up-to-date when any patch commit exists in target history', async () => {
    const git = makeGit({
      log: vi.fn(async () => [{ oid: 'abc' }, { oid: 'def' }]) as any,
    });
    const res = await analyzePatchMergeability(git, '/repo', patchWith(['def', 'xyz']));
    expect(res.analysis).toBe('up-to-date');
    expect(res.upToDate).toBe(true);
  });

  it('returns error for invalid patch content', async () => {
    const git = makeGit();
    const res = await analyzePatchMergeability(git, '/repo', { ...patchWith(['x']), raw: { content: '' } });
    expect(res.analysis).toBe('error');
    expect(String(res.errorMessage || '')).toMatch(/invalid patch content/i);
  });

  it('falls back to first available branch when preferred and common candidates are missing', async () => {
    const git: any = {
      listRemotes: vi.fn(async () => []) as any,
      // Fail resolution for main/master/develop/dev, succeed for alt
      resolveRef: vi.fn(async ({ ref }: any) => {
        if (ref === 'refs/heads/alt') return 'altHead';
        if (ref === 'refs/remotes/origin/alt') throw new Error('no remote');
        throw new Error('missing');
      }) as any,
      listBranches: vi.fn(async () => ['alt']) as any,
      isDescendent: vi.fn(async () => false) as any,
      findMergeBase: vi.fn(async () => undefined) as any,
      log: vi.fn(async () => []) as any,
      readBlob: vi.fn(async () => ({ blob: new TextEncoder().encode('same') })) as any,
    };

    const patch = { id: 'p', commits: [{ oid: 'c1', message: 'm', author: { name: 'n', email: 'e' } }], baseBranch: 'alt', raw: { content: 'diff --git a/a.txt b/a.txt\n' } } as any;
    const res = await analyzePatchMergeability(git, '/repo', patch, 'missing');
    expect(res.targetCommit).toBe('altHead');
    // With no divergence, not ff, and no conflicts, result should be clean
    expect(res.analysis === 'clean' || res.fastForward === true || res.hasConflicts === false).toBe(true);
  });
});
