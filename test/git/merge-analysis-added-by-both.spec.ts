import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import type { GitProvider } from '../../src/git/provider.js';
import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';
import { createTestFs, mkdirp } from '../utils/lightningfs.js';
import { createRemoteRegistry } from '../utils/remote-registry.js';
import { createTestGitProvider } from '../utils/provider-harness.js';
import { initRepo, commitFile } from '../utils/git-harness.js';

function addFileDiff(filepath: string, content: string): string {
  return [
    `diff --git a/${filepath} b/${filepath}`,
    `new file mode 100644`,
    `index 0000000..1111111`,
    `--- /dev/null`,
    `+++ b/${filepath}`,
    `@@ -0,0 +1 @@`,
    `+${content}`,
    ''
  ].join('\n');
}

describe('git/merge-analysis: added-by-both conflict detection', () => {
  it('flags conflict when file is added by patch and already exists in target', async () => {
    const fs = createTestFs('merge-add-both');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const dir = '/repos/merge-add-both';
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'AB', email: 'ab@example.com' } };
    await initRepo(h, 'base');
    // Seed initial commit so checkout on new branch succeeds
    await commitFile(h, '/seed.txt', 'seed\n', 'seed');

    // Create target branch and add the file there with different content
    const { createBranch } = await import('../utils/git-harness.js');
    await createBranch(h, 'main', true);
    await commitFile(h, '/c.txt', 'target\n', 'add c in target');

    // Patch adds c.txt too
    const patch: any = {
      id: 'add-both',
      commits: [{ oid: 'a'.repeat(40), message: 'add both', author: { name: 'AB', email: 'ab@example.com' } }],
      baseBranch: 'base',
      raw: { content: addFileDiff('c.txt', 'patch\n') },
    };

    const res = await analyzePatchMergeability(git as any as GitProvider, dir, patch, 'main');
    expect(res.hasConflicts).toBe(true);
    expect(res.conflictFiles).toEqual(expect.arrayContaining(['c.txt']));
  });
});
