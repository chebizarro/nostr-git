import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';

function filenameOnlyDiff(filepath: string): string {
  return [
    `diff --git a/${filepath} b/${filepath}`,
    `--- a/${filepath}`,
    `+++ b/${filepath}`,
    ''
  ].join('\n');
}

describe('git/merge-analysis: readBlob failure falls back to modified=>conflict for filename-only', () => {
  it('flags conflict on filename-only when file modified in target (conservative path)', async () => {
    let call = 0;
    const encoder = new TextEncoder();
    const git: any = {
      async listRemotes() { return []; },
      async resolveRef({ ref }: any) { return ref.includes('refs/heads/') ? 'target' : 'x'; },
      async readBlob() {
        // 1st call: currentContent read -> return "HEAD"
        // 2nd call: base branch content -> return "BASE"
        // 3rd call: target branch content -> return "TARGET" (different from BASE)
        call++;
        const val = call === 1 ? 'HEAD' : (call === 2 ? 'BASE' : 'TARGET');
        return { blob: encoder.encode(val) };
      },
      async log() { return []; },
      async isDescendent() { return false; },
      async findMergeBase() { return undefined; },
    } as any;

    const patch: any = {
      id: 'rbf',
      commits: [{ oid: 'c'.repeat(40), message: 'm', author: { name: 'n', email: 'e' } }],
      baseBranch: 'main',
      raw: { content: filenameOnlyDiff('d.txt') },
    };

    const res = await analyzePatchMergeability(git, '/repo', patch, 'main');
    expect(res.hasConflicts).toBe(true);
    expect(res.conflictFiles).toEqual(expect.arrayContaining(['d.txt']));
  });
});
