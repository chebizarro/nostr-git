import { describe, it, expect, vi } from 'vitest'
import type { GitProvider } from '../../src/git/provider.js'
import { analyzePatchMergeUtil, applyPatchAndPushUtil } from '../../src/worker/workers/patches.js'

function makeMergeResult(overrides: Partial<import('../../src/git/merge-analysis.js').MergeAnalysisResult> = {}) {
  return {
    canMerge: true,
    hasConflicts: false,
    conflictFiles: [],
    conflictDetails: [],
    upToDate: true,
    fastForward: true,
    targetCommit: 'target',
    remoteCommit: 'remote',
    patchCommits: [],
    analysis: 'clean',
    errorMessage: undefined,
    ...overrides,
  } as any
}

class MemoryFs {
  files = new Map<string, string>()

  promises = {
    mkdir: async (_path: string, _opts?: { recursive?: boolean }) => {
      // no-op for tests
    },
    readFile: async (path: string, _encoding: string) => {
      const v = this.files.get(path)
      if (v == null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return v
    },
    writeFile: async (path: string, data: string, _encoding: string) => {
      this.files.set(path, data)
    },
  }
}

describe('git-worker patch utilities', () => {
  it('analyzePatchMergeUtil delegates to analyzePatchMergeability with resolved branch', async () => {
    const git = {} as unknown as GitProvider
    const analyze = vi.fn().mockResolvedValue(makeMergeResult())

    const result = await analyzePatchMergeUtil(
      git,
      {
        repoId: 'user/repo',
        patchData: {
          id: 'patch1',
          commits: [],
          baseBranch: 'feature/foo',
          rawContent: 'diff --git a/x b/x',
        },
        targetBranch: undefined,
      },
      {
        rootDir: '/root',
        parseRepoId: (id: string) => id,
        resolveBranchName: async (_dir: string, requested?: string) => requested || 'main',
        analyzePatchMergeability: analyze,
      },
    )

    expect(analyze).toHaveBeenCalledTimes(1)
    const [calledGit, calledDir, calledPatch, calledBranch] = analyze.mock.calls[0]
    expect(calledGit).toBe(git)
    expect(calledDir).toBe('/root/user/repo')
    expect(calledPatch.id).toBe('patch1')
    expect(calledBranch).toBe('feature/foo')
    expect(result.analysis).toBe('clean')
  })

  it('analyzePatchMergeUtil returns error result when delegate throws', async () => {
    const git = {} as unknown as GitProvider
    const analyze = vi.fn().mockRejectedValue(new Error('boom'))

    const result = await analyzePatchMergeUtil(
      git,
      {
        repoId: 'repo',
        patchData: {
          id: 'p',
          commits: [],
          baseBranch: 'main',
          rawContent: 'diff',
        },
      },
      {
        rootDir: '/root',
        parseRepoId: (id: string) => id,
        resolveBranchName: async (_dir: string, requested?: string) => requested || 'main',
        analyzePatchMergeability: analyze,
      },
    )

    expect(result.canMerge).toBe(false)
    expect(result.analysis).toBe('error')
    expect(result.errorMessage).toBe('boom')
  })

  it('applyPatchAndPushUtil applies an additive patch, commits, and handles no remotes', async () => {
    const fs = new MemoryFs()

    const git: any = {
      checkout: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue('abc123'),
      listRemotes: vi.fn().mockResolvedValue([]),
    }

    git.statusMatrix = vi
      .fn()
      .mockResolvedValue([[ 'file.txt', 0, 1, 2 ]]) // indicate staged/modified

    const repoId = 'user/repo'
    const rootDir = '/root'
    const dir = `${rootDir}/${repoId}`

    const diff = [
      'diff --git a/file.txt b/file.txt',
      'new file mode 100644',
      'index 0000000..e69de29',
      '--- /dev/null',
      '+++ b/file.txt',
      '@@ -0,0 +1 @@',
      '+hello',
    ].join('\n')

    const result = await applyPatchAndPushUtil(
      git,
      {
        repoId,
        patchData: {
          id: 'patch1',
          commits: [],
          baseBranch: 'main',
          rawContent: diff,
        },
        authorName: 'Tester',
        authorEmail: 'tester@example.com',
      },
      {
        rootDir,
        parseRepoId: (id: string) => id,
        resolveBranchName: async (_dir, requested) => requested || 'main',
        ensureFullClone: async () => ({ success: true }),
        getAuthCallback: () => null,
        getConfiguredAuthHosts: () => [],
        getProviderFs: () => fs as any,
      },
    )

    expect(result.success).toBe(true)
    expect(result.mergeCommitOid).toBe('abc123')
    expect(result.warning).toBe('No remotes configured - changes only applied locally')
    expect(git.checkout).toHaveBeenCalledWith({ dir, ref: 'main' })
    expect(git.add).toHaveBeenCalledWith({ dir, filepath: 'file.txt' })
    expect(git.commit).toHaveBeenCalled()

    const stored = await fs.promises.readFile(`${dir}/file.txt`, 'utf8')
    expect(stored).toBe('hello')
  })

  it('applyPatchAndPushUtil fails fast on unsupported binary/rename patches', async () => {
    const fs = new MemoryFs()
    const git: any = {
      checkout: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      commit: vi.fn(),
      listRemotes: vi.fn().mockResolvedValue([]),
    }

    const result = await applyPatchAndPushUtil(
      git,
      {
        repoId: 'repo',
        patchData: {
          id: 'p',
          commits: [],
          baseBranch: 'main',
          rawContent: 'diff --git a/bin b/bin\nGIT binary patch',
        },
        authorName: 'Tester',
        authorEmail: 't@example.com',
      },
      {
        rootDir: '/root',
        parseRepoId: (id: string) => id,
        resolveBranchName: async (_dir, requested) => requested || 'main',
        ensureFullClone: async () => ({ success: true }),
        getAuthCallback: () => null,
        getConfiguredAuthHosts: () => [],
        getProviderFs: () => fs as any,
      },
    )

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Unsupported patch features/)
  })
})
