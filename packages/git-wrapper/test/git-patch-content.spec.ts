import {describe, it, expect, vi, beforeEach} from "vitest"
import {defaultGetPatchContent} from "../src/git-patch-content.js"

vi.mock("../src/git-diff-content.js", () => ({
  generateUnifiedDiff: vi.fn(async () => "diff --git a/file b/file\n@@ 0,0 0,0 @@\n"),
}))

describe("defaultGetPatchContent", () => {
  const git: any = {
    readCommit: vi.fn(async ({oid}: any) => ({commit: {message: `subject for ${oid}\nbody`}})),
  }

  it("includes unified diff when fs/dir and refs are provided", async () => {
    const content = await defaultGetPatchContent(git, {
      src: "refs/heads/feature",
      baseBranch: "refs/heads/main",
      repoAddr: "10001:pub:repo",
      dir: "/tmp/repo",
      fs: {},
      commit: "abc",
    })
    expect(content).toMatch(/diff --git/)
  })

  it("falls back to cover letter when no fs/dir", async () => {
    const content = await defaultGetPatchContent(git, {
      src: "refs/heads/feature",
      baseBranch: "refs/heads/main",
      repoAddr: "10001:pub:repo",
    } as any)
    expect(content).toMatch(/Patch: feature/)
  })
})
