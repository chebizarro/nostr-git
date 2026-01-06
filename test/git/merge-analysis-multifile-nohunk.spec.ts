import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';

function multiFilenameOnlyDiff(files: string[]): string {
  return files.map((f) => [
    `diff --git a/${f} b/${f}`,
    `--- a/${f}`,
    `+++ b/${f}`,
    ''
  ].join('\n')).join('\n');
}

describe('git/merge-analysis: multi-file filename-only diff -> conservative conflicts', () => {
  it('flags both files as conflicts when target content changed', async () => {
    let call = 0;
    const encoder = new TextEncoder();
    const git: any = {
      async listRemotes() { return []; },
      async resolveRef({ ref }: any) { return ref.includes('refs/heads/') ? 'target' : 'x'; },
      async readBlob() {
        // Cycle HEAD, BASE, TARGET, then repeat per file
        call++;
        const mod = call % 3;
        const val = mod === 1 ? 'HEAD' : (mod === 2 ? 'BASE' : 'TARGET');
        return { blob: encoder.encode(val) };
      },
      async log() { return []; },
      async isDescendent() { return false; },
      async findMergeBase() { return undefined; },
    } as any;

    const files = ['a.txt', 'b.txt'];
    const patch: any = {
      id: 'multi',
      commits: [{ oid: 'e'.repeat(40), message: 'm', author: { name: 'n', email: 'e' } }],
      baseBranch: 'main',
      raw: { content: multiFilenameOnlyDiff(files) },
    };

    const res = await analyzePatchMergeability(git, '/repo', patch, 'main');
    expect(res.hasConflicts).toBe(true);
    expect(res.conflictFiles).toEqual(expect.arrayContaining(files));
  });
});
