import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';

const gitFF: any = {
  async listRemotes() { return []; },
  async resolveRef({ ref }: any) { return ref.includes('refs/heads/') ? 'target' : 'x'; },
  async isDescendent() { return true; },
  async findMergeBase() { return 'target'; },
  async log() { return []; },
};

describe('git/merge-analysis: fast-forward path', () => {
  it('returns clean+fastForward when target is ancestor of patch tip', async () => {
    const patch: any = {
      id: 'ff',
      commits: [{ oid: 'p'.repeat(40), message: 'm', author: { name: 'n', email: 'e' } }],
      baseBranch: 'main',
      raw: { content: 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n' },
    };
    const res = await analyzePatchMergeability(gitFF, '/repo', patch, 'main');
    expect(res.analysis).toBe('clean');
    expect(res.fastForward).toBe(true);
    expect(res.canMerge).toBe(true);
  });
});
