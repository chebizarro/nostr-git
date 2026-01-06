import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';

const gitMock: any = {
  async listRemotes() { return []; },
  async resolveRef({ ref }: any) { return ref.includes('refs/heads/') ? 'target' : 'x'; },
  async log() { return []; },
  async isDescendent() { return false; },
  async findMergeBase() { return undefined; },
};

describe('git/merge-analysis: malformed patch content -> error', () => {
  it('treats non-diff content as clean (no changes detected)', async () => {
    const patch: any = {
      id: 'bad',
      commits: [{ oid: 'b'.repeat(40), message: 'm', author: { name: 'n', email: 'e' } }],
      baseBranch: 'main',
      raw: { content: 'THIS IS NOT A DIFF\njust text\n' },
    };
    const res = await analyzePatchMergeability(gitMock, '/repo', patch, 'main');
    expect(res.analysis).toBe('clean');
    expect(res.hasConflicts).toBe(false);
  });
});
