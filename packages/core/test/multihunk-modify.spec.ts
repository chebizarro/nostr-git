import { describe, it, expect, vi } from 'vitest';
import { applyPatchAndPushUtil } from '../src/lib/workers/patches.js';

function makeMemFs() {
  const files = new Map<string, string>();
  const promises = {
    mkdir: async (_p: string, _o?: any) => {},
    readFile: async (p: string, enc: string) => {
      if (!files.has(p)) throw new Error('ENOENT');
      return files.get(p)!;
    },
    writeFile: async (p: string, data: string, enc: string) => {
      files.set(p, data);
    },
  } as any;
  return { files, fs: { promises } };
}

function makeGit(overrides: Partial<any> = {}): any {
  const base: any = {
    checkout: vi.fn(async () => {}),
    add: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    commit: vi.fn(async () => 'abcd1234'),
    listRemotes: vi.fn(async () => []),
    push: vi.fn(async () => {}),
  };
  return Object.assign(base, overrides);
}

/**
 * This test exercises a single-file patch with two separated hunks
 * and ensures our multi-hunk application logic applies both correctly.
 */
describe('applyPatchAndPushUtil - multi-hunk modify', () => {
  it('applies two hunks to the same file', async () => {
    const git = makeGit();
    const mem = makeMemFs();

    // Seed file content in the in-memory fs
    const initial = [
      'line1',
      'line2',
      'line3',
      'line4',
      'line5',
      'line6',
      'line7',
      'line8',
      'line9',
      'line10',
    ].join('\n');

    const dir = '/tmp/org/repo';
    mem.files.set(`${dir}/README.md`, initial);

    const patch = [
      'diff --git a/README.md b/README.md',
      'index 1111111..2222222 100644',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -2,3 +2,3 @@',
      ' line2',
      '-line3',
      '+LINE3_EDITED',
      ' line4',
      '@@ -8,3 +8,4 @@',
      ' line8',
      '+LINE8_5',
      ' line9',
      ' line10',
    ].join('\n');

    const res = await applyPatchAndPushUtil(
      git,
      {
        repoId: 'org/repo',
        patchData: { id: 'mh1', commits: [], baseBranch: 'main', rawContent: patch },
        authorName: 'Test',
        authorEmail: 'test@example.com',
      },
      {
        rootDir: '/tmp',
        canonicalRepoKey: (s) => s,
        resolveRobustBranch: async (_dir, requested) => requested || 'main',
        ensureFullClone: async () => ({}),
        getAuthCallback: () => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: () => mem.fs,
      }
    );

    expect(res.success).toBe(true);

    const final = await mem.fs.promises.readFile(`${dir}/README.md`, 'utf8');
    const lines = final.split('\n');
    expect(lines[2]).toBe('LINE3_EDITED'); // index 2 -> 3rd line
    expect(lines[7]).toBe('line8');
    expect(lines[8]).toBe('LINE8_5');
    expect(lines[9]).toBe('line9');
  });
});
