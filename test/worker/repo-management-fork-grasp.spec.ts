import {beforeEach, describe, expect, it, vi} from "vitest"
import {nip19} from "nostr-tools"

vi.mock("../../src/git/provider-factory.js", () => ({
  getGitServiceApi: vi.fn(() => ({
    forkRepo: vi.fn(async () => {
      throw new Error("GRASP not supported without external EventIO")
    }),
  })),
}))

vi.mock("../../src/worker/workers/fs-utils.js", () => ({
  getProviderFs: vi.fn(),
  ensureDir: vi.fn(async () => {}),
  isRepoClonedFs: vi.fn(async () => true),
}))

vi.mock("../../src/worker/workers/repos.js", () => ({
  cloneRemoteRepoUtil: vi.fn(async () => {}),
}))

import {forkAndCloneRepo} from "../../src/worker/workers/repo-management.js"

describe("worker/repo-management GRASP fork output", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns npub-based repoId and forkUrl for hex pubkey token", async () => {
    const tokenHex = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    const ownerNpub = nip19.npubEncode(tokenHex)
    const git = {
      listBranches: vi.fn(async () => ["main"]),
      listTags: vi.fn(async () => ["v1"]),
    } as any

    const result = await forkAndCloneRepo(git, {} as any, "/root", {
      owner: "upstream-owner",
      repo: "upstream-repo",
      forkName: "forked-repo",
      visibility: "public",
      token: tokenHex,
      dir: "forked-repo",
      provider: "grasp",
      baseUrl: "wss://relay.example",
      sourceCloneUrls: ["https://example.com/upstream-owner/upstream-repo.git"],
      sourceRepoId: "upstream-owner/upstream-repo",
    })

    expect(result.success).toBe(true)
    expect(result.repoId).toBe(`${ownerNpub}/forked-repo`)
    expect(result.forkUrl).toBe(`https://relay.example/${ownerNpub}/forked-repo.git`)
  })
})
