import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  inferProviderFromUrl,
  mergePRAndPushUtil,
  analyzePRMergeUtil,
  type MergePRAndPushOptions,
  type AnalyzePRMergeOptions,
} from "../../src/worker/workers/pr-merge.js"
import type { GitProvider } from "../../src/git/provider.js"

describe("pr-merge", () => {
  describe("inferProviderFromUrl", () => {
    it("returns grasp for relay.ngit.dev", () => {
      expect(inferProviderFromUrl("https://relay.ngit.dev/npub123/repo")).toBe("grasp")
    })

    it("returns grasp for gitnostr.com", () => {
      expect(inferProviderFromUrl("https://gitnostr.com/npub123/repo")).toBe("grasp")
    })

    it("returns grasp for hosts containing grasp", () => {
      expect(inferProviderFromUrl("https://grasp.example.com/repo")).toBe("grasp")
    })

    it("returns github for github.com", () => {
      expect(inferProviderFromUrl("https://github.com/user/repo.git")).toBe("github")
    })

    it("returns github for enterprise GitHub", () => {
      expect(inferProviderFromUrl("https://git.company.github.com/user/repo")).toBe("github")
    })

    it("returns gitlab for gitlab.com", () => {
      expect(inferProviderFromUrl("https://gitlab.com/user/repo.git")).toBe("gitlab")
    })

    it("returns gitlab for enterprise GitLab", () => {
      expect(inferProviderFromUrl("https://gitlab.company.com/user/repo")).toBe("gitlab")
    })

    it("returns undefined for unknown hosts", () => {
      expect(inferProviderFromUrl("https://bitbucket.org/user/repo")).toBeUndefined()
      expect(inferProviderFromUrl("https://sourcehut.org/user/repo")).toBeUndefined()
    })

    it("returns undefined for invalid URLs", () => {
      expect(inferProviderFromUrl("not-a-url")).toBeUndefined()
      expect(inferProviderFromUrl("")).toBeUndefined()
    })

    it("handles ssh URLs via hostname parsing", () => {
      // SSH URLs (git@host:path) are not parseable by URL(); inferProviderFromUrl uses
      // new URL() so they return undefined. Document this as expected behavior.
      const sshGitHub = "ssh://git@github.com/user/repo.git"
      const sshGitLab = "ssh://git@gitlab.com/user/repo.git"
      expect(inferProviderFromUrl(sshGitHub)).toBe("github")
      expect(inferProviderFromUrl(sshGitLab)).toBe("gitlab")
    })
  })

  describe("mergePRAndPushUtil", () => {
    const mockGit: GitProvider = {
      addRemote: vi.fn().mockResolvedValue(undefined),
      deleteRemote: vi.fn().mockResolvedValue(undefined),
      setConfig: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue(undefined),
      writeRef: vi.fn().mockResolvedValue(undefined),
      checkout: vi.fn().mockResolvedValue(undefined),
      resolveRef: vi.fn().mockImplementation(({ ref }) => {
        if (ref === "main" || ref === "refs/heads/main") return Promise.resolve("target-oid-123")
        if (ref?.startsWith("refs/pr-tip-merge-")) return Promise.resolve("tip-oid-456")
        return Promise.resolve("some-oid")
      }),
      merge: vi.fn().mockResolvedValue({ oid: "merge-commit-oid-789" }),
      listRemotes: vi.fn().mockResolvedValue([]),
      deleteRef: vi.fn().mockResolvedValue(undefined),
    } as any

    const baseDeps = {
      rootDir: "/tmp/repos",
      parseRepoId: (id: string) => id.replace(/[^a-zA-Z0-9-_]/g, "-"),
      resolveBranchName: vi.fn().mockResolvedValue("main"),
      ensureFullClone: vi.fn().mockResolvedValue(undefined),
      getAuthCallback: vi.fn().mockReturnValue(undefined),
      pushToRemote: vi.fn().mockResolvedValue({ success: true }),
      safePushToRemote: vi.fn().mockResolvedValue({ success: true }),
      getTokensForRemote: vi.fn().mockResolvedValue([{ token: "fake-token" }]),
    }

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("returns error when no valid clone URLs after filtering", async () => {
      const result = await mergePRAndPushUtil(mockGit, {
        repoId: "test-repo",
        cloneUrls: ["nostr://relay.example.com", "", "  "],
        tipCommitOid: "abc123",
      } as MergePRAndPushOptions, baseDeps as any)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No valid clone URLs")
    })

    it("returns mergeCommitOid and skips push when skipPush is true", async () => {
      const result = await mergePRAndPushUtil(mockGit, {
        repoId: "test-repo",
        cloneUrls: ["https://github.com/user/repo.git"],
        tipCommitOid: "tip-oid-456",
        targetBranch: "main",
        skipPush: true,
      } as MergePRAndPushOptions, baseDeps as any)

      expect(result.success).toBe(true)
      expect(result.mergeCommitOid).toBe("merge-commit-oid-789")
      expect(result.warning).toContain("Push deferred")
      expect(result.pushedRemotes).toEqual([])
      expect(baseDeps.pushToRemote).not.toHaveBeenCalled()
      expect(baseDeps.safePushToRemote).not.toHaveBeenCalled()
    })

    it("returns error when fetch fails from all URLs", async () => {
      const gitWithFailingFetch = {
        ...mockGit,
        fetch: vi.fn().mockRejectedValue(new Error("Fetch failed")),
      } as any

      const result = await mergePRAndPushUtil(gitWithFailingFetch, {
        repoId: "test-repo",
        cloneUrls: ["https://github.com/user/repo.git"],
        tipCommitOid: "tip-oid",
      } as MergePRAndPushOptions, baseDeps as any)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it("calls resolveBranchName with dir and targetBranch", async () => {
      await mergePRAndPushUtil(mockGit, {
        repoId: "test-repo",
        cloneUrls: ["https://github.com/user/repo.git"],
        tipCommitOid: "tip-oid",
        targetBranch: "develop",
        skipPush: true,
      } as MergePRAndPushOptions, baseDeps as any)

      expect(baseDeps.resolveBranchName).toHaveBeenCalledWith(
        expect.stringContaining("test-repo"),
        "develop",
      )
    })
  })

  describe("analyzePRMergeUtil", () => {
    const mockGit: GitProvider = {
      addRemote: vi.fn().mockResolvedValue(undefined),
      deleteRemote: vi.fn().mockResolvedValue(undefined),
      setConfig: vi.fn().mockResolvedValue(undefined),
      fetch: vi.fn().mockResolvedValue(undefined),
      resolveRef: vi.fn().mockImplementation(({ ref }) => {
        if (ref === "refs/heads/main") return Promise.resolve("target-oid")
        if (ref?.includes("pr-source")) return Promise.resolve("tip-oid")
        return Promise.resolve("some-oid")
      }),
      merge: vi.fn().mockResolvedValue({ oid: "merge-oid" }),
      findMergeBase: vi.fn().mockResolvedValue("base-oid"),
      isDescendent: vi.fn().mockResolvedValue(false),
      listBranches: vi.fn().mockResolvedValue(["main"]),
    } as any

    const baseDeps = {
      rootDir: "/tmp/repos",
      parseRepoId: (id: string) => id.replace(/[^a-zA-Z0-9-_]/g, "-"),
      resolveBranchName: vi.fn().mockResolvedValue("main"),
    }

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("delegates to analyzePRMergeability and returns result shape", async () => {
      const opts: AnalyzePRMergeOptions = {
        repoId: "30617:npub123/repo",
        prCloneUrls: ["https://github.com/user/fork.git"],
        tipCommitOid: "tip-oid",
        targetBranch: "main",
        allCommitOids: ["c1", "c2"],
      }

      const result = await analyzePRMergeUtil(mockGit, opts, baseDeps as any)

      expect(result).toBeDefined()
      expect(typeof result.canMerge).toBe("boolean")
      expect(typeof result.hasConflicts).toBe("boolean")
      expect(Array.isArray(result.conflictFiles)).toBe(true)
      expect(typeof result.analysis).toBe("string")
      expect(Array.isArray(result.patchCommits)).toBe(true)
    })

    it("returns error result when prCloneUrls filter to empty", async () => {
      const result = await analyzePRMergeUtil(
        mockGit,
        {
          repoId: "repo",
          prCloneUrls: ["nostr://relay.example.com", ""],
          tipCommitOid: "tip",
        } as AnalyzePRMergeOptions,
        baseDeps as any,
      )
      expect(result.analysis).toBe("error")
      expect(result.errorMessage).toContain("No valid clone URLs")
    })
  })
})
