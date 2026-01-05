import { describe, it, expect, vi } from 'vitest';
import type { GitProvider } from '../src/git/provider.js';
import { applyPatchAndPushUtil } from '../src/worker/workers/patches.js';

function makeMemFs() {
  const files = new Map<string, string>();
  const promises = {
    mkdir: async (_p: string, _o?: any) => {},
    readFile: async (p: string, enc: string) => {
      if (!files.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return files.get(p)!;
    },
    writeFile: async (p: string, data: string, enc: string) => {
      files.set(p, data);
    }
  } as any;
  return { files, fs: { promises } };
}

function makeGit(overrides: Partial<GitProvider> = {}): GitProvider {
  const base: any = {
    checkout: vi.fn(async () => {}),
    add: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    commit: vi.fn(async () => 'merge1234'),
    listRemotes: vi.fn(async () => [{ remote: 'origin', url: 'https://example.com/repo.git' }]),
    push: vi.fn(async () => {}),
    statusMatrix: vi.fn(async () => [
      ['src/a.txt', 0, 2, 2],
      ['docs/b.txt', 0, 2, 2],
      ['old/c.txt', 1, 0, 0]
    ])
  };
  return Object.assign(base, overrides) as any;
}

// Multi-file diff: add src/a.txt, modify docs/b.txt, delete old/c.txt
const multiFilePatch =
  `diff --git a/src/a.txt b/src/a.txt\nnew file mode 100644\nindex 0000000..e69de29\n--- /dev/null\n+++ b/src/a.txt\n@@ -0,0 +1,2 @@\n+hello\n+world\n\n` +
  `diff --git a/docs/b.txt b/docs/b.txt\nindex e69de29..0cfbf08 100644\n--- a/docs/b.txt\n+++ b/docs/b.txt\n@@ -0,0 +1,1 @@\n+intro\n\n` +
  `diff --git a/old/c.txt b/old/c.txt\ndeleted file mode 100644\nindex e69de29..0000000\n--- a/old/c.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-legacy\n`;

describe('integration: multi-file patch', () => {
  it('applies add/modify/delete across directories and pushes', async () => {
    const repoId = 'Org/Repo';
    const rootDir = '/tmp';
    const dir = `${rootDir}/${repoId.toLowerCase()}`;
    const mem = makeMemFs();
    // Seed existing files for modify/delete
    mem.files.set(`${dir}/docs/b.txt`, '');
    mem.files.set(`${dir}/old/c.txt`, 'legacy\n');

    const git = makeGit();

    const res = await applyPatchAndPushUtil(
      git,
      {
        repoId,
        patchData: { id: 'mf1', commits: [], baseBranch: 'main', rawContent: multiFilePatch },
        authorName: 'Zed',
        authorEmail: 'zed@example.com'
      },
      {
        rootDir,
        canonicalRepoKey: (s) => s.toLowerCase(),
        resolveRobustBranch: async (_dir, requested) => requested || 'main',
        ensureFullClone: async () => ({}),
        getAuthCallback: (_url) => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: () => mem.fs
      }
    );

    expect(res.success).toBe(true);
    expect(mem.files.get(`${dir}/src/a.txt`)).toContain('world');
    expect(mem.files.get(`${dir}/docs/b.txt`)).toContain('intro');
    // deletion is not reflected in mem.files map automatically; we assert remove() called
    expect(git.remove as any).toHaveBeenCalledWith({ dir, filepath: 'old/c.txt' });
    expect(res.pushedRemotes).toEqual(['origin']);
  });
});
