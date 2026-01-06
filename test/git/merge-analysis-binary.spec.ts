import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';

// Simulate a binary diff chunk (no @@ hunks, filename-only header with index and binary markers)
function binaryDiff(file: string): string {
  return [
    `diff --git a/${file} b/${file}`,
    `index e69de29..5d41402 100644`,
    `Binary files a/${file} and b/${file} differ`,
    ''
  ].join('\n');
}

describe('git/merge-analysis: binary diff treated conservatively as conflict', () => {
  it('flags conflict when filename-only binary diff and target content changed', async () => {
    let call = 0;
    const encoder = new TextEncoder();
    const git: any = {
      async listRemotes() { return []; },
      async resolveRef({ ref }: any) { return ref.includes('refs/heads/') ? 'target' : 'x'; },
      async readBlob() {
        // HEAD, BASE, TARGET (different)
        call++;
        const val = call === 1 ? 'HEAD-BIN' : (call === 2 ? 'BASE-BIN' : 'TARGET-BIN');
        return { blob: encoder.encode(val) };
      },
      async log() { return []; },
      async isDescendent() { return false; },
      async findMergeBase() { return undefined; },
    } as any;

    const patch: any = {
      id: 'bin',
      commits: [{ oid: 'a'.repeat(40), message: 'binary', author: { name: 'n', email: 'e' } }],
      baseBranch: 'main',
      raw: { content: binaryDiff('image.png') },
    };

    const res = await analyzePatchMergeability(git, '/repo', patch, 'main');
    expect(res.hasConflicts).toBe(true);
    expect(res.conflictFiles).toEqual(expect.arrayContaining(['image.png']));
  });
});
