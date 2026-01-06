import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';

function makeGitDiverged(): any {
  return {
    async listRemotes() { return [{ remote: 'origin', url: 'https://example.com/repo.git' }]; },
    async fetch() { /* no-op */ },
    async resolveRef({ ref }: any) {
      if (String(ref).includes('refs/remotes/origin/')) return 'remote123';
      if (String(ref).includes('refs/heads/')) return 'local456';
      return 'some';
    },
    async isDescendent() { return false; },
    async log() { return []; },
    async findMergeBase() { return undefined; },
    async readCommit() { throw new Error('missing'); },
  };
}

describe('git/merge-analysis: remote divergence path', () => {
  it('returns analysis=diverged when local is not descendant of remote', async () => {
    const git = makeGitDiverged();
    const patch: any = {
      id: 'div',
      commits: [{ oid: 'c'.repeat(40), message: 'm', author: { name: 'n', email: 'e' } }],
      baseBranch: 'main',
      raw: { content: 'diff --git a/x b/x\n--- a/x\n+++ b/x\n' },
    };
    const res = await analyzePatchMergeability(git, '/repo', patch, 'main');
    expect(res.analysis).toBe('diverged');
    expect(res.canMerge).toBe(false);
  });
});
