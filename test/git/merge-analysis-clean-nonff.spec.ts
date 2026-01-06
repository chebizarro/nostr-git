import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';

const git: any = {
  async listRemotes() { return []; },
  async resolveRef({ ref }: any) { return ref.includes('refs/heads/') ? 'target' : 'x'; },
  async isDescendent() { return false; },
  async findMergeBase() { return 'base'; },
  async log() { return []; },
};

function simpleHunk(file: string): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -1 +1 @@`,
    `-old`,
    `+new`,
    ''
  ].join('\n');
}

describe('git/merge-analysis: clean non-fast-forward', () => {
  it('reports clean merge possible without fast-forward', async () => {
    const patch: any = {
      id: 'clean',
      commits: [{ oid: 'f'.repeat(40), message: 'm', author: { name: 'n', email: 'e' } }],
      baseBranch: 'main',
      raw: { content: simpleHunk('x.txt') },
    };
    const res = await analyzePatchMergeability(git, '/repo', patch, 'main');
    expect(res.analysis).toBe('clean');
    expect(res.fastForward).toBe(false);
    expect(res.canMerge).toBe(true);
    expect(res.hasConflicts).toBe(false);
  });
});
