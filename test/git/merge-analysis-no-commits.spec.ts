import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';

const gitMock: any = {
  async resolveRef({ ref }: any) {
    if (String(ref).startsWith('refs/heads/')) return 'targetCommit';
    return 'oid';
  },
  async listRemotes() { return []; },
  async log() { return []; },
  async isDescendent() { return false; },
  async findMergeBase() { return undefined; },
};

describe('git/merge-analysis: no commits in patch -> error', () => {
  it('returns analysis=error with message when patch has no commits', async () => {
    const patch: any = {
      id: 'empty',
      commits: [],
      baseBranch: 'main',
      raw: { content: 'some-content' },
    };
    const res = await analyzePatchMergeability(gitMock, '/repo', patch, 'main');
    expect(res.analysis).toBe('error');
    expect(String(res.errorMessage || '')).toMatch(/No commits/);
  });
});
