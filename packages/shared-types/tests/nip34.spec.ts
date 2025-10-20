import { describe, it, expect } from "vitest"
import {
  // Constants
  GIT_PULL_REQUEST,
  GIT_PULL_REQUEST_UPDATE,
  GIT_USER_GRASP_LIST,
  
  // Event types
  type PullRequestEvent,
  type PullRequestUpdateEvent,
  type UserGraspListEvent,
  
  // Helper functions
  createPullRequestEvent,
  createPullRequestUpdateEvent,
  createUserGraspListEvent,
  parsePullRequestEvent,
  parsePullRequestUpdateEvent,
  parseUserGraspListEvent,
  isPullRequestEvent,
  isPullRequestUpdateEvent,
  isUserGraspListEvent,
  getNostrKindLabel,
  
  // Validation functions
  validatePullRequestEvent,
  validatePullRequestUpdateEvent,
  validateUserGraspListEvent,
} from "../src/index.js"

describe("NIP-34 Pull Request Events", () => {
  describe("Constants", () => {
    it("should have correct kind values", () => {
      expect(GIT_PULL_REQUEST).toBe(1618)
      expect(GIT_PULL_REQUEST_UPDATE).toBe(1619)
      expect(GIT_USER_GRASP_LIST).toBe(10317)
    })
  })

  describe("Type Guards", () => {
    it("should identify pull request events", () => {
      const event: PullRequestEvent = {
        id: "test-id",
        pubkey: "test-pubkey",
        created_at: 1234567890,
        kind: GIT_PULL_REQUEST,
        tags: [
          ["a", "30617:repo-id"],
          ["r", "https://github.com/user/repo"],
          ["p", "author-pubkey"],
          ["subject", "PR Title"],
          ["t", "bug"],
          ["c", "commit-hash"],
          ["clone", "https://github.com/user/repo"],
          ["branch-name", "feature-branch"],
          ["e", "event-id"],
          ["merge-base", "base-commit"]
        ],
        content: "PR description in markdown",
        sig: "test-sig"
      }
      
      expect(isPullRequestEvent(event)).toBe(true)
      expect(isPullRequestUpdateEvent(event)).toBe(false)
      expect(isUserGraspListEvent(event)).toBe(false)
    })

    it("should identify pull request update events", () => {
      const event: PullRequestUpdateEvent = {
        id: "test-id",
        pubkey: "test-pubkey",
        created_at: 1234567890,
        kind: GIT_PULL_REQUEST_UPDATE,
        tags: [
          ["a", "30617:repo-id"],
          ["r", "https://github.com/user/repo"],
          ["p", "author-pubkey"],
          ["c", "commit-hash"],
          ["clone", "https://github.com/user/repo"],
          ["merge-base", "base-commit"]
        ],
        content: "",
        sig: "test-sig"
      }
      
      expect(isPullRequestUpdateEvent(event)).toBe(true)
      expect(isPullRequestEvent(event)).toBe(false)
      expect(isUserGraspListEvent(event)).toBe(false)
    })

    it("should identify user grasp list events", () => {
      const event: UserGraspListEvent = {
        id: "test-id",
        pubkey: "test-pubkey",
        created_at: 1234567890,
        kind: GIT_USER_GRASP_LIST,
        tags: [
          ["g", "https://grasp.example.com"]
        ],
        content: "",
        sig: "test-sig"
      }
      
      expect(isUserGraspListEvent(event)).toBe(true)
      expect(isPullRequestEvent(event)).toBe(false)
      expect(isPullRequestUpdateEvent(event)).toBe(false)
    })
  })

  describe("Event Creation", () => {
    it("should create pull request events", () => {
      const event = createPullRequestEvent({
        repoAddr: "30617:test-repo",
        recipients: ["author-pubkey"],
        subject: "PR Title",
        labels: ["bug"],
        commits: ["commit-hash"],
        clone: ["https://github.com/user/repo"],
        branchName: "feature-branch",
        mergeBase: "base-commit",
        content: "PR description",
        signer: {
          getPublicKey: () => Promise.resolve("test-pubkey"),
          signEvent: () => Promise.resolve("test-sig")
        }
      })

      expect(event.kind).toBe(GIT_PULL_REQUEST)
      expect(event.content).toBe("PR description")
      expect(event.tags).toContainEqual(["a", "30617:test-repo"])
      expect(event.tags).toContainEqual(["p", "author-pubkey"])
      expect(event.tags).toContainEqual(["subject", "PR Title"])
      expect(event.tags).toContainEqual(["t", "bug"])
      expect(event.tags).toContainEqual(["c", "commit-hash"])
      expect(event.tags).toContainEqual(["clone", "https://github.com/user/repo"])
      expect(event.tags).toContainEqual(["branch-name", "feature-branch"])
      expect(event.tags).toContainEqual(["merge-base", "base-commit"])
    })

    it("should create pull request update events", () => {
      const event = createPullRequestUpdateEvent({
        repoAddr: "30617:test-repo",
        recipients: ["author-pubkey"],
        commits: ["commit-hash"],
        clone: ["https://github.com/user/repo"],
        mergeBase: "base-commit",
        signer: {
          getPublicKey: () => Promise.resolve("test-pubkey"),
          signEvent: () => Promise.resolve("test-sig")
        }
      })

      expect(event.kind).toBe(GIT_PULL_REQUEST_UPDATE)
      expect(event.content).toBe("")
      expect(event.tags).toContainEqual(["a", "30617:test-repo"])
      expect(event.tags).toContainEqual(["p", "author-pubkey"])
      expect(event.tags).toContainEqual(["c", "commit-hash"])
      expect(event.tags).toContainEqual(["clone", "https://github.com/user/repo"])
      expect(event.tags).toContainEqual(["merge-base", "base-commit"])
    })

    it("should create user grasp list events", () => {
      const event = createUserGraspListEvent({
        services: ["https://grasp.example.com", "https://grasp2.example.com"],
        signer: {
          getPublicKey: () => Promise.resolve("test-pubkey"),
          signEvent: () => Promise.resolve("test-sig")
        }
      })

      expect(event.kind).toBe(GIT_USER_GRASP_LIST)
      expect(event.content).toBe("")
      expect(event.tags).toContainEqual(["g", "https://grasp.example.com"])
      expect(event.tags).toContainEqual(["g", "https://grasp2.example.com"])
    })
  })

  describe("Event Parsing", () => {
    it("should parse pull request events", () => {
      const event: PullRequestEvent = {
        id: "test-id",
        pubkey: "test-pubkey",
        created_at: 1234567890,
        kind: GIT_PULL_REQUEST,
        tags: [
          ["a", "30617:repo-id"],
          ["r", "https://github.com/user/repo"],
          ["p", "author-pubkey"],
          ["subject", "PR Title"],
          ["t", "bug"],
          ["c", "commit-hash"],
          ["clone", "https://github.com/user/repo"],
          ["branch-name", "feature-branch"],
          ["e", "event-id"],
          ["merge-base", "base-commit"]
        ],
        content: "PR description",
        sig: "test-sig"
      }

      const parsed = parsePullRequestEvent(event)
      expect(parsed.repoId).toBe("30617:repo-id")
      expect(parsed.subject).toBe("PR Title")
      expect(parsed.labels).toEqual(["bug"])
      expect(parsed.commits).toEqual(["commit-hash"])
      expect(parsed.branchName).toBe("feature-branch")
      expect(parsed.mergeBase).toBe("base-commit")
      expect(parsed.content).toBe("PR description")
      expect(parsed.author.pubkey).toBe("test-pubkey")
    })

    it("should parse pull request update events", () => {
      const event: PullRequestUpdateEvent = {
        id: "test-id",
        pubkey: "test-pubkey",
        created_at: 1234567890,
        kind: GIT_PULL_REQUEST_UPDATE,
        tags: [
          ["a", "30617:repo-id"],
          ["r", "https://github.com/user/repo"],
          ["p", "author-pubkey"],
          ["c", "commit-hash"],
          ["clone", "https://github.com/user/repo"],
          ["merge-base", "base-commit"]
        ],
        content: "",
        sig: "test-sig"
      }

      const parsed = parsePullRequestUpdateEvent(event)
      expect(parsed.repoId).toBe("30617:repo-id")
      expect(parsed.commits).toEqual(["commit-hash"])
      expect(parsed.mergeBase).toBe("base-commit")
      expect(parsed.author.pubkey).toBe("test-pubkey")
    })

    it("should parse user grasp list events", () => {
      const event: UserGraspListEvent = {
        id: "test-id",
        pubkey: "test-pubkey",
        created_at: 1234567890,
        kind: GIT_USER_GRASP_LIST,
        tags: [
          ["g", "https://grasp.example.com"],
          ["g", "https://grasp2.example.com"]
        ],
        content: "",
        sig: "test-sig"
      }

      const parsed = parseUserGraspListEvent(event)
      expect(parsed.services).toEqual(["https://grasp.example.com", "https://grasp2.example.com"])
    })
  })

  describe("Validation", () => {
    it("should validate pull request events", () => {
      const event: PullRequestEvent = {
        id: "test-id",
        pubkey: "test-pubkey",
        created_at: 1234567890,
        kind: GIT_PULL_REQUEST,
        tags: [
          ["a", "30617:repo-id"],
          ["r", "https://github.com/user/repo"],
          ["p", "author-pubkey"],
          ["subject", "PR Title"],
          ["t", "bug"],
          ["c", "commit-hash"],
          ["clone", "https://github.com/user/repo"],
          ["branch-name", "feature-branch"],
          ["e", "event-id"],
          ["merge-base", "base-commit"]
        ],
        content: "PR description",
        sig: "test-sig"
      }

      const result = validatePullRequestEvent(event)
      expect(result.success).toBe(true)
    })

    it("should validate pull request update events", () => {
      const event: PullRequestUpdateEvent = {
        id: "test-id",
        pubkey: "test-pubkey",
        created_at: 1234567890,
        kind: GIT_PULL_REQUEST_UPDATE,
        tags: [
          ["a", "30617:repo-id"],
          ["r", "https://github.com/user/repo"],
          ["p", "author-pubkey"],
          ["c", "commit-hash"],
          ["clone", "https://github.com/user/repo"],
          ["merge-base", "base-commit"]
        ],
        content: "",
        sig: "test-sig"
      }

      const result = validatePullRequestUpdateEvent(event)
      expect(result.success).toBe(true)
    })

    it("should validate user grasp list events", () => {
      const event: UserGraspListEvent = {
        id: "test-id",
        pubkey: "test-pubkey",
        created_at: 1234567890,
        kind: GIT_USER_GRASP_LIST,
        tags: [
          ["g", "https://grasp.example.com"]
        ],
        content: "",
        sig: "test-sig"
      }

      const result = validateUserGraspListEvent(event)
      expect(result.success).toBe(true)
    })

    it("should reject invalid pull request events", () => {
      const invalidEvent = {
        id: "test-id",
        pubkey: "test-pubkey",
        created_at: 1234567890,
        kind: GIT_PULL_REQUEST,
        tags: [
          // Missing required tags
        ],
        content: "PR description",
        sig: "test-sig"
      }

      const result = validatePullRequestEvent(invalidEvent as any)
      expect(result.success).toBe(false)
    })
  })

  describe("Kind Labels", () => {
    it("should return correct labels for new kinds", () => {
      expect(getNostrKindLabel(GIT_PULL_REQUEST)).toBe("Pull Request")
      expect(getNostrKindLabel(GIT_PULL_REQUEST_UPDATE)).toBe("Pull Request Update")
      expect(getNostrKindLabel(GIT_USER_GRASP_LIST)).toBe("User Grasp List")
    })
  })
})
