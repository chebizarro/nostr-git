import { describe, it, expect, vi } from 'vitest';
import type { GitProvider } from '../src/git/provider.js';
import { applyPatchAndPushUtil } from '../src/worker/workers/patches.js';

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
    }
  } as any;
  return { files, fs: { promises } };
}

function makeGit(overrides: Partial<GitProvider> = {}): GitProvider {
  const base: any = {
    checkout: vi.fn(async () => {}),
    add: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    commit: vi.fn(async () => 'abcd1234'),
    listRemotes: vi.fn(async () => []),
    push: vi.fn(async () => {})
  };
  return Object.assign(base, overrides) as any;
}

const patchAddReadme = `diff --git a/README.md b/README.md\nnew file mode 100644\nindex 0000000..e69de29\n--- /dev/null\n+++ b/README.md\n@@ -0,0 +1,1 @@\n+Hello\n`;
const patchModifyFile = (name: string) =>
  `diff --git a/${name} b/${name}\nindex e69de29..0cfbf08 100644\n--- a/${name}\n+++ b/${name}\n@@ -0,0 +1,2 @@\n+line1\n+line2\n`;
const patchDeleteFile = (name: string) =>
  `diff --git a/${name} b/${name}\ndeleted file mode 100644\nindex e69de29..0000000\n--- a/${name}\n+++ /dev/null\n@@ -1 +0,0 @@\n-line1\n`;

describe('applyPatchAndPushUtil', () => {
  it('returns success with warning when no remotes configured', async () => {
    const git = makeGit({ listRemotes: vi.fn(async () => []) });
    const mem = makeMemFs();

    const res = await applyPatchAndPushUtil(
      git,
      {
        repoId: 'Org/Repo',
        patchData: { id: 'p1', commits: [], baseBranch: 'main', rawContent: patchAddReadme },
        authorName: 'A',
        authorEmail: 'a@example.com'
      },
      {
        rootDir: '/tmp',
        parseRepoId: (s) => s.toLowerCase(),
        resolveBranchName: async (_dir, requested) => requested || 'main',
        ensureFullClone: async () => ({}),
        getAuthCallback: (_url) => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: () => mem.fs
      }
    );

    expect(res.success).toBe(true);
    expect(res.warning).toMatch(/No remotes configured/);
    expect(git.commit).toHaveBeenCalled();
  });

  it('pushes to remotes successfully', async () => {
    const git = makeGit({
      listRemotes: vi.fn(async () => [{ remote: 'origin', url: 'https://example.com/repo.git' }])
    });
    const mem = makeMemFs();

    const res = await applyPatchAndPushUtil(
      git,
      {
        repoId: 'Org/Repo',
        patchData: { id: 'p2', commits: [], baseBranch: 'main', rawContent: patchAddReadme },
        authorName: 'B',
        authorEmail: 'b@example.com'
      },
      {
        rootDir: '/tmp',
        parseRepoId: (s) => s.toLowerCase(),
        resolveBranchName: async (_dir, requested) => requested || 'main',
        ensureFullClone: async () => ({}),
        getAuthCallback: (_url) => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: () => mem.fs
      }
    );

    expect(res.success).toBe(true);
    expect(res.pushedRemotes).toEqual(['origin']);
    expect(git.push).toHaveBeenCalled();
  });

  it('modifies an existing file and commits', async () => {
    const repoId = 'Org/Repo';
    const rootDir = '/tmp';
    const key = repoId.toLowerCase();
    const dir = `${rootDir}/${key}`;

    const mem = makeMemFs();
    mem.files.set(`${dir}/src/app.txt`, '');

    const git = makeGit({
      listRemotes: vi.fn(async () => []),
      statusMatrix: vi.fn(async () => [['src/app.txt', 0, 2, 2]])
    });

    const res = await applyPatchAndPushUtil(
      git,
      {
        repoId,
        patchData: {
          id: 'p3',
          commits: [],
          baseBranch: 'main',
          rawContent: patchModifyFile('src/app.txt')
        },
        authorName: 'C',
        authorEmail: 'c@example.com'
      },
      {
        rootDir,
        parseRepoId: (s) => s.toLowerCase(),
        resolveBranchName: async (_dir, requested) => requested || 'main',
        ensureFullClone: async () => ({}),
        getAuthCallback: (_url) => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: () => mem.fs
      }
    );

    expect(res.success).toBe(true);
    expect(mem.files.get(`${dir}/src/app.txt`)).toContain('line2');
    expect(git.commit).toHaveBeenCalled();
  });

  it('deletes a file when patch indicates deletion', async () => {
    const repoId = 'Org/Repo';
    const rootDir = '/tmp';
    const key = repoId.toLowerCase();
    const dir = `${rootDir}/${key}`;

    const mem = makeMemFs();
    mem.files.set(`${dir}/docs/old.txt`, 'line1\n');

    const git = makeGit({
      listRemotes: vi.fn(async () => []),
      statusMatrix: vi.fn(async () => [['docs/old.txt', 1, 0, 0]]),
      remove: vi.fn(async () => {})
    });

    const res = await applyPatchAndPushUtil(
      git,
      {
        repoId,
        patchData: {
          id: 'p4',
          commits: [],
          baseBranch: 'main',
          rawContent: patchDeleteFile('docs/old.txt')
        },
        authorName: 'D',
        authorEmail: 'd@example.com'
      },
      {
        rootDir,
        parseRepoId: (s) => s.toLowerCase(),
        resolveBranchName: async (_dir, requested) => requested || 'main',
        ensureFullClone: async () => ({}),
        getAuthCallback: (_url) => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: () => mem.fs
      }
    );

    expect(res.success).toBe(true);
    expect(git.remove).toHaveBeenCalledWith({ dir, filepath: 'docs/old.txt' });
  });

  it('returns error for no-op patch (status shows no changes)', async () => {
    const git = makeGit({
      listRemotes: vi.fn(async () => []),
      statusMatrix: vi.fn(async () => [])
    });
    const mem = makeMemFs();

    const res = await applyPatchAndPushUtil(
      git,
      {
        repoId: 'Org/Repo',
        patchData: { id: 'p5', commits: [], baseBranch: 'main', rawContent: patchAddReadme },
        authorName: 'E',
        authorEmail: 'e@example.com'
      },
      {
        rootDir: '/tmp',
        parseRepoId: (s) => s.toLowerCase(),
        resolveBranchName: async (_dir, requested) => requested || 'main',
        ensureFullClone: async () => ({}),
        getAuthCallback: (_url) => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: () => mem.fs
      }
    );

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/No changes to apply/);
  });

  it('collects push errors per remote', async () => {
    const git = makeGit({
      listRemotes: vi.fn(async () => [
        { remote: 'origin', url: 'https://example.com/repo.git' },
        { remote: 'backup', url: 'https://example.com/backup.git' }
      ]),
      push: vi.fn(async (args: any) => {
        if (args.url.includes('backup'))
          throw Object.assign(new Error('denied'), { code: 'DENIED' });
      })
    });
    const mem = makeMemFs();

    const res = await applyPatchAndPushUtil(
      git,
      {
        repoId: 'Org/Repo',
        patchData: { id: 'p6', commits: [], baseBranch: 'main', rawContent: patchAddReadme },
        authorName: 'F',
        authorEmail: 'f@example.com'
      },
      {
        rootDir: '/tmp',
        parseRepoId: (s) => s.toLowerCase(),
        resolveBranchName: async (_dir, requested) => requested || 'main',
        ensureFullClone: async () => ({}),
        getAuthCallback: (_url) => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: () => mem.fs
      }
    );

    expect(res.success).toBe(true);
    expect(res.pushedRemotes).toContain('origin');
    expect(res.skippedRemotes).toContain('backup');
    expect(res.pushErrors?.[0].code).toBe('DENIED');
  });

  it('rejects rename patches as unsupported', async () => {
    const git = makeGit({ listRemotes: vi.fn(async () => []) });
    const mem = makeMemFs();
    const renamePatch = `diff --git a/old.txt b/new.txt\nrename from old.txt\nrename to new.txt\n@@ -1 +1 @@\n-old\n+new\n`;

    const res = await applyPatchAndPushUtil(
      git,
      {
        repoId: 'Org/Repo',
        patchData: { id: 'rn1', commits: [], baseBranch: 'main', rawContent: renamePatch },
        authorName: 'G',
        authorEmail: 'g@example.com'
      },
      {
        rootDir: '/tmp',
        parseRepoId: (s) => s.toLowerCase(),
        resolveBranchName: async (_dir, requested) => requested || 'main',
        ensureFullClone: async () => ({}),
        getAuthCallback: (_url) => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: () => mem.fs
      }
    );

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unsupported patch features/);
  });

  it('rejects binary patches as unsupported', async () => {
    const git = makeGit({ listRemotes: vi.fn(async () => []) });
    const mem = makeMemFs();
    const binaryPatch = `diff --git a/img.png b/img.png\nnew file mode 100644\nindex 0000000..e69de29\nGIT binary patch\nliteral 0\nHcmV?d00001\n`;

    const res = await applyPatchAndPushUtil(
      git,
      {
        repoId: 'Org/Repo',
        patchData: { id: 'bn1', commits: [], baseBranch: 'main', rawContent: binaryPatch },
        authorName: 'H',
        authorEmail: 'h@example.com'
      },
      {
        rootDir: '/tmp',
        parseRepoId: (s) => s.toLowerCase(),
        resolveBranchName: async (_dir, requested) => requested || 'main',
        ensureFullClone: async () => ({}),
        getAuthCallback: (_url) => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: () => ({ promises: mem.fs.promises }) as any
      }
    );

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unsupported patch features/);
  });
});
