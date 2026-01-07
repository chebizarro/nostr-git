import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock parse-diff to simulate a patch that touches a.txt with add/del lines (producing markers)
vi.mock('parse-diff', () => ({
  default: () => ([
    {
      to: 'a.txt',
      chunks: [
        { content: '@@ -1,2 +1,2 @@', changes: [ { type: 'add', ln2: 2 }, { type: 'del', ln: 2 } ] }
      ]
    }
  ])
}));

// Build a minimal GitProvider stub that triggers hasLocalChanges=true and provides blob reads
function makeGit() {
  return {
    listRemotes: vi.fn(async () => []),
    fetch: vi.fn(async () => undefined),
    resolveRef: vi.fn(async ({ ref }: any) => {
      if (ref === 'refs/heads/main') return 'targetOID';
      if (ref === 'refs/heads/base') return 'baseOID';
      if (ref === 'refs/remotes/origin/main') return 'remoteCommit';
      throw new Error('bad ref');
    }),
    // readBlob returns different contents based on OID to force hasLocalChanges=true
    readBlob: vi.fn(async ({ oid, filepath }: any) => ({ blob: new TextEncoder().encode(oid === 'baseOID' ? 'BASE-CONTENT' : 'TARGET-CONTENT') })),
    // readCommit used in up-to-date detection path but not reached here
    readCommit: vi.fn(async () => ({ commit: { author: { email: 'e' }, message: 'm' } })),
    isDescendent: vi.fn(async () => false),
    log: vi.fn(async () => [{ oid: 't1', commit: { author: { email: 'e' }, message: 'z' } }]),
    listBranches: vi.fn(async () => ['main'])
  } as any;
}

describe('git/merge-analysis conflicts path', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns conflicts when diff touches a file also modified on target', async () => {
    const git = makeGit();
    const { analyzePatchMergeability } = await import('../../src/git/merge-analysis.js');
    const patch = {
      id: 'p1',
      commits: [{ oid: 'c1', message: 'm', author: { name: 'n', email: 'e' } }],
      baseBranch: 'base',
      raw: { content: 'diff --git a/a.txt b/a.txt\n' },
    } as any;

    const res = await analyzePatchMergeability(git as any, '/repo', patch);
    expect(res.hasConflicts).toBe(true);
    expect(res.conflictFiles).toContain('a.txt');
    expect(res.canMerge).toBe(false);
  });
});
