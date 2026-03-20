import {beforeEach, describe, it, expect, vi} from "vitest"
import "fake-indexeddb/auto"

const pushMock = vi.fn(async () => undefined)
const fetchMock = vi.fn(async () => undefined)
const addRemoteMock = vi.fn(async () => undefined)
const listRemotesMock = vi.fn(async () => [])

// Capture the exposed API from the worker via comlink.expose
let exposed: any
vi.mock("comlink", () => ({
  expose: (obj: any) => {
    exposed = obj
  },
}))

// Mock Git provider used by the worker
vi.mock("../../src/git/factory-browser.js", () => ({
  createGitProvider: () => ({
    push: pushMock,
    fetch: fetchMock,
    addRemote: addRemoteMock,
    listRemotes: listRemotesMock,
    resolveRef: vi.fn(async () => "abc123def456"),
    // Other methods may be referenced in unrelated API paths but are not invoked here
    statusMatrix: vi.fn(async () => []),
    log: vi.fn(async () => []),
    listBranches: vi.fn(async () => ["main"]),
  }),
}))

// Mock provider FS accessor to a minimal FS
vi.mock("../../src/worker/workers/fs-utils.js", () => ({
  getProviderFs: (_g: any) => ({promises: {stat: async () => ({})}}),
  isRepoClonedFs: async (_g: any, _d: string) => true,
}))

// Default mock for getNostrGitProvider is undefined; individual tests will override
vi.mock("../../src/api/git-provider.js", () => ({
  getNostrGitProvider: () => undefined,
  hasNostrGitProvider: () => false,
  initializeNostrGitProvider: () => {},
}))

// Import the worker module AFTER mocks so comlink.expose is intercepted
await import("../../src/worker/worker.js")

describe("worker.pushToRemote API", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pushMock.mockReset()
    fetchMock.mockReset()
    addRemoteMock.mockReset()
    listRemotesMock.mockReset()
    pushMock.mockResolvedValue(undefined)
    fetchMock.mockResolvedValue(undefined)
    addRemoteMock.mockResolvedValue(undefined)
    listRemotesMock.mockResolvedValue([])
  })

  it("uses Nostr provider path and propagates blossomSummary when available", async () => {
    // Arrange: install a nostr provider that returns a blossomSummary
    const summary = {uploaded: 3, failures: []} as any
    const pushSpy = vi.fn(async () => ({blossomSummary: summary}))
    const mod = await import("../../src/api/git-provider.js")
    ;(mod as any).getNostrGitProvider = () => ({push: pushSpy})
    ;(mod as any).hasNostrGitProvider = () => true

    // Act: call pushToRemote on exposed API
    // Use a Nostr URL pattern to trigger the NostrGitProvider path
    const res = await exposed.pushToRemote({
      repoId: "owner/repo",
      remoteUrl: "https://relay.ngit.dev/owner/repo.git",
      branch: "main",
    })

    // Assert
    expect(res.success).toBe(true)
    expect(res.branch).toBe("main")
    expect(res.blossomSummary).toEqual(summary)
    expect(pushSpy).toHaveBeenCalledTimes(1)
  })

  it("falls back to git.push when no Nostr provider and returns success without blossomSummary", async () => {
    // Arrange: ensure getNostrGitProvider returns undefined
    const mod = await import("../../src/api/git-provider.js")
    ;(mod as any).getNostrGitProvider = () => undefined

    // Act
    const res = await exposed.pushToRemote({
      repoId: "owner/repo",
      remoteUrl: "https://example.com/owner/repo.git",
      branch: "main",
    })

    // Assert
    expect(res.success).toBe(true)
    expect(res.branch).toBe("main")
    expect(res.blossomSummary).toBeUndefined()
  })

  it("retries GRASP push once after missing-object repair fetch", async () => {
    const missingError = Object.assign(
      new Error("One or more branches were not updated: missing necessary objects"),
      {
        data: {
          prettyDetails: "- refs/heads/main: missing necessary objects",
        },
      },
    )

    pushMock.mockRejectedValueOnce(missingError).mockResolvedValueOnce(undefined)
    listRemotesMock.mockResolvedValue([
      {remote: "origin", url: "https://github.com/upstream/repo.git"},
    ] as any)

    const res = await exposed.pushToRemote({
      repoId: "owner/repo",
      remoteUrl: "https://relay.ngit.dev/owner/repo.git",
      branch: "main",
      token: "deadbeef",
      provider: "grasp",
    })

    expect(res.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledTimes(2)
  })
})
