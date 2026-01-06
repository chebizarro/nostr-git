import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';

const baseGitMock: any = {
  async listRemotes() { return []; },
  async resolveRef({ ref }: any) { return ref.includes('refs/heads/') ? 'targetHead' : 'some'; },
  async log() { return []; },
  async isDescendent() { return false; },
  async findMergeBase() { return undefined; },
};

describe('git/merge-analysis quick-win branches', () => {
  it('returns error for invalid raw content', async () => {
    const patch: any = { id: 'x', commits: [{ oid: 'c'.repeat(40), message: 'm', author: { name: 'n', email: 'e' } }], baseBranch: 'main', raw: { content: '' } };
    const res = await analyzePatchMergeability(baseGitMock, '/repo', patch, 'main');
    expect(res.analysis).toBe('error');
    expect(String(res.errorMessage || '')).toMatch(/invalid patch content/);
  });

  it('returns up-to-date when patch commit exists in target history', async () => {
    const oid = 'd'.repeat(40);
    const git: any = {
      ...baseGitMock,
      async log() { return [{ oid }, { oid: 'z'.repeat(40) }]; },
    };
    const patch: any = { id: 'y', commits: [{ oid, message: 'm', author: { name: 'n', email: 'e' } }], baseBranch: 'main', raw: { content: 'diff --git a/x b/x\n--- a/x\n+++ b/x\n' } };
    const res = await analyzePatchMergeability(git, '/repo', patch, 'main');
    expect(res.analysis).toBe('up-to-date');
    expect(res.upToDate).toBe(true);
  });
});
