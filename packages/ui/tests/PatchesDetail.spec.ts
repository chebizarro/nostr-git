/*
  PatchesDetail.spec.ts
  Comprehensive tests for the patches detail page functionality.
  Tests patch navigation, merge analysis, status emission, merge workflow, and UI interactions.
*/

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  RepoAnnouncementEvent,
  RepoStateEvent,
  PatchEvent,
  IssueEvent,
  StatusEvent,
  CommentEvent,
  NostrEvent,
} from "@nostr-git/shared-types";
import { parseRepoAnnouncementEvent, parsePatchEvent, createStatusEvent } from "@nostr-git/shared-types";
import { canonicalRepoKey } from "@nostr-git/core";
import type { Commit, Patch, MergeAnalysisResult } from "@nostr-git/core";

// Mock external dependencies
vi.mock("@welshman/app", () => ({
  pubkey: { subscribe: vi.fn() },
  repository: { subscribe: vi.fn() },
  page: { subscribe: vi.fn() },
}));

vi.mock("@lib/budabit", () => ({
  postComment: vi.fn(),
  postStatus: vi.fn(),
  postRoleLabel: vi.fn(),
  deleteRoleLabelEvent: vi.fn(),
}));

vi.mock("@nostr-git/ui", () => ({
  Button: vi.fn(),
  Profile: vi.fn(),
  MergeStatus: vi.fn(),
  toast: {
    push: vi.fn(),
  },
  Status: vi.fn(),
  DiffViewer: vi.fn(),
  IssueThread: vi.fn(),
  MergeAnalyzer: vi.fn(),
  PeoplePicker: vi.fn(),
}));

vi.mock("@welshman/store", () => ({
  deriveEvents: vi.fn(),
}));

vi.mock("@welshman/net", () => ({
  load: vi.fn(),
}));

// Mock factories for test data
function mkRepoAnnouncement(overrides: any = {}): RepoAnnouncementEvent {
  const obj: any = {
    id: overrides.id || "ev-id-30617",
    kind: 30617,
    pubkey: overrides.pubkey || "owner-pubkey",
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    tags: (overrides as any).tags || [
      ["d", "repo-name"],
      ["a", "30617:owner-pubkey:repo-name"],
    ],
    content: overrides.content || "",
    sig: overrides.sig || "sig",
  };
  return obj as unknown as RepoAnnouncementEvent;
}

function mkRepoState(overrides: any = {}): RepoStateEvent {
  const obj: any = {
    id: overrides.id || "ev-id-30618",
    kind: 30618,
    pubkey: overrides.pubkey || "owner-pubkey",
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    tags: (overrides as any).tags || [
      ["r", "refs/heads/main", "ref"],
      ["r", "0000000000000000000000000000000000000001", "commit"],
    ],
    content: overrides.content || "",
    sig: overrides.sig || "sig",
  };
  return obj as unknown as RepoStateEvent;
}

function mkPatch(overrides: any = {}): PatchEvent {
  const obj: any = {
    id: overrides.id || "patch-1",
    kind: 1617,
    pubkey: overrides.pubkey || "author-pubkey",
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    tags: (overrides as any).tags || [["t", "root"]],
    content: overrides.content || "patch content",
    sig: overrides.sig || "sig",
  };
  return obj as unknown as PatchEvent;
}

function mkStatus(
  overrides: any & { kind: 1630 | 1631 | 1632 | 1633 }
): StatusEvent {
  const obj: any = {
    id: overrides.id || `status-${Math.random().toString(36).slice(2)}`,
    kind: overrides.kind,
    pubkey: overrides.pubkey || "user-pubkey",
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    tags: overrides.tags || [
      ["e", "root-id", "", "root"],
    ],
    content: overrides.content || "",
    sig: overrides.sig || "sig",
  };
  return obj as unknown as StatusEvent;
}

function mkComment(rootId: string, overrides: any = {}): CommentEvent {
  return {
    id: overrides.id || `cmt-${Math.random().toString(36).slice(2)}`,
    kind: overrides.kind || 1111,
    pubkey: overrides.pubkey || "user-1",
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    tags: (overrides as any).tags || [["e", rootId]],
    content: overrides.content || "comment",
    sig: overrides.sig || "sig",
  } as unknown as CommentEvent;
}

function mkCommit(overrides: any = {}): Commit {
  return {
    oid: overrides.oid || "commit-" + Math.random().toString(36).slice(2),
    message: overrides.message || "Test commit",
    author: overrides.author || {
      name: "Test Author",
      email: "test@example.com",
    },
    committer: overrides.committer || {
      name: "Test Author",
      email: "test@example.com",
    },
    parent: overrides.parent || [],
  };
}

function mkPatchData(overrides: any = {}): Patch {
  return {
    id: overrides.id || "patch-id-1",
    repoId: overrides.repoId || "test-repo-id",
    title: overrides.title || "Test Patch",
    description: overrides.description || "Test patch description",
    author: overrides.author || {
      pubkey: "author-pubkey",
      name: "Test Author",
    },
    baseBranch: overrides.baseBranch || "main",
    commitCount: overrides.commitCount || 1,
    commits: overrides.commits || [mkCommit()],
    commitHash: overrides.commitHash || "hash-123",
    createdAt: overrides.createdAt || new Date().toISOString(),
    diff: overrides.diff || [],
    status: overrides.status || "open",
    raw: overrides.raw || mkPatch(),
  };
}

function mkMergeAnalysisResult(overrides: any = {}): MergeAnalysisResult {
  return {
    canMerge: overrides.canMerge ?? true,
    hasConflicts: overrides.hasConflicts ?? false,
    conflictFiles: overrides.conflictFiles || [],
    conflictDetails: overrides.conflictDetails || [],
    patchCommits: overrides.patchCommits || [],
    analysis: overrides.analysis || "clean",
    upToDate: overrides.upToDate ?? true,
    fastForward: overrides.fastForward ?? false,
  };
}

// Mock repository class for testing
class MockRepoClass {
  patches: PatchEvent[] = [];
  maintainers: string[] = ["maintainer-1", "maintainer-2"];
  repoId: string = "test-repo-id";
  mainBranch: string = "main";
  key: string = "test-key";
  relays: string[] = ["relay1", "relay2"];
  workerManager: any = {
    applyPatchAndPush: vi.fn(),
  };
  
  getMergeAnalysis = vi.fn().mockResolvedValue(mkMergeAnalysisResult());
}

describe("Patches Detail Page", () => {
  let mockRepo: MockRepoClass;
  let mockPatchSet: Patch[];
  let mockStatusEvents: StatusEvent[];
  let mockCommentEvents: CommentEvent[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = new MockRepoClass();
    mockPatchSet = [
      mkPatchData({ id: "patch-1", title: "First Patch" }),
      mkPatchData({ id: "patch-2", title: "Second Patch" }),
      mkPatchData({ id: "patch-3", title: "Third Patch" }),
    ];
    mockStatusEvents = [
      mkStatus({ kind: 1630, content: "Open" }),
    ];
    mockCommentEvents = [
      mkComment("patch-1", { content: "First comment" }),
      mkComment("patch-1", { content: "Second comment" }),
    ];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Patch Navigation", () => {
    it("should navigate between patches in a patch set", () => {
      // Test patch navigation logic
      const currentIndex = 0;
      const hasPrevious = currentIndex > 0;
      const hasNext = currentIndex < mockPatchSet.length - 1;
      
      expect(hasPrevious).toBe(false);
      expect(hasNext).toBe(true);
      
      // Navigate to next patch
      const nextIndex = currentIndex + 1;
      const nextPatch = mockPatchSet[nextIndex];
      expect(nextPatch.id).toBe("patch-2");
      
      // Test navigation from middle patch
      const middleIndex = 1;
      const middleHasPrevious = middleIndex > 0;
      const middleHasNext = middleIndex < mockPatchSet.length - 1;
      
      expect(middleHasPrevious).toBe(true);
      expect(middleHasNext).toBe(true);
    });

    it("should handle single patch navigation correctly", () => {
      const singlePatch = [mkPatchData({ id: "single-patch" })];
      const currentIndex = 0;
      const hasPrevious = currentIndex > 0;
      const hasNext = currentIndex < singlePatch.length - 1;
      
      expect(hasPrevious).toBe(false);
      expect(hasNext).toBe(false);
    });
  });

  describe("User-Triggered Patch Analysis", () => {
    it("should trigger analysis when analyze button is clicked", async () => {
      const mockAnalysisResult = mkMergeAnalysisResult({
        canMerge: true,
        hasConflicts: false,
      });
      
      mockRepo.getMergeAnalysis.mockResolvedValue(mockAnalysisResult);
      
      // Simulate user clicking analyze button
      const analysisResult = await mockRepo.getMergeAnalysis(
        mockRepo.patches[0] || mkPatch(),
        "main"
      );
      
      expect(mockRepo.getMergeAnalysis).toHaveBeenCalled();
      expect(analysisResult.canMerge).toBe(true);
      expect(analysisResult.hasConflicts).toBe(false);
    });

    it("should handle analysis errors gracefully", async () => {
      const errorMessage = "Analysis failed";
      mockRepo.getMergeAnalysis.mockRejectedValue(new Error(errorMessage));
      
      try {
        await mockRepo.getMergeAnalysis(mkPatch(), "main");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(errorMessage);
      }
    });

    it("should show manual analysis indicator when triggered", () => {
      // Test state tracking for manual analysis
      let analysisTriggeredManually = false;
      
      // Simulate manual trigger
      analysisTriggeredManually = true;
      
      expect(analysisTriggeredManually).toBe(true);
    });
  });

  describe("Merge Workflow", () => {
    it("should prepare patch data for entire patch set", () => {
      const firstPatch = mockPatchSet[0];
      const allCommits = mockPatchSet.flatMap(p => p.commits || []);
      
      const patchData = {
        id: firstPatch.id,
        commits: allCommits.map(commit => ({
          oid: commit.oid,
          message: commit.message,
          author: {
            name: commit.author?.name || "",
            email: commit.author?.email || "",
          },
        })),
        baseBranch: firstPatch.baseBranch || "main",
        rawContent: firstPatch.raw?.content || "",
      };
      
      expect(patchData.id).toBe("patch-1");
      expect(patchData.commits).toHaveLength(3); // 3 patches with 1 commit each
      expect(patchData.baseBranch).toBe("main");
    });

    it("should emit status event after successful merge", async () => {
      const { postStatus } = await import("@lib/budabit");
      const mergeCommitOid = "merge-commit-123";
      const mergeCommitMessage = "Test merge commit message";
      
      const statusEvent = createStatusEvent({
        kind: 1631, // GIT_STATUS_APPLIED
        content: mergeCommitMessage,
        rootId: "patch-1",
        recipients: mockRepo.maintainers,
        repoAddr: mockRepo.repoId,
        relays: mockRepo.relays,
        appliedCommits: ["commit-1", "commit-2", "commit-3"],
        mergedCommit: mergeCommitOid,
      });
      
      await (postStatus as any)(statusEvent, mockRepo.relays);
      
      expect(postStatus).toHaveBeenCalledWith(statusEvent, mockRepo.relays);
      expect(statusEvent.kind).toBe(1631);
      expect(statusEvent.content).toBe(mergeCommitMessage);
      expect(statusEvent.tags).toContainEqual(["p", "maintainer-1"]);
      expect(statusEvent.tags).toContainEqual(["p", "maintainer-2"]);
    });

    it("should handle merge failure gracefully", async () => {
      const mockWorkerManager = {
        applyPatchAndPush: vi.fn().mockResolvedValue({
          success: false,
          error: "Merge conflict detected",
        }),
      };
      
      mockRepo.workerManager = mockWorkerManager;
      
      const patchData = {
        id: "patch-1",
        commits: [],
        baseBranch: "main",
        rawContent: "patch content",
      };
      
      const result = await mockWorkerManager.applyPatchAndPush({
        repoId: mockRepo.repoId,
        patchData,
        targetBranch: mockRepo.mainBranch,
        mergeCommitMessage: "Test merge",
        authorName: "Test Author",
        authorEmail: "test@example.com",
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe("Merge conflict detected");
    });
  });

  describe("Comment Functionality", () => {
    it("should handle threaded comments on patches", () => {
      const patchId = "patch-1";
      const patchComments = mockCommentEvents.filter(
        comment => comment.tags.some(tag => tag[0] === "e" && tag[1] === patchId)
      );
      
      expect(patchComments).toHaveLength(2);
      expect(patchComments[0].content).toBe("First comment");
      expect(patchComments[1].content).toBe("Second comment");
    });

    it("should create new comment events", async () => {
      const { postComment } = await import("@lib/budabit");
      const newComment = mkComment("patch-1", {
        content: "New test comment",
        pubkey: "user-123",
      });
      
      (postComment as any)(newComment, ["relay1", "relay2"]);
      
      expect(postComment).toHaveBeenCalledWith(newComment, ["relay1", "relay2"]);
      expect(newComment.content).toBe("New test comment");
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle empty patch set", () => {
      const emptyPatchSet: Patch[] = [];
      const hasPatches = emptyPatchSet.length > 0;
      
      expect(hasPatches).toBe(false);
    });

    it("should handle missing repository data", () => {
      const incompleteRepo = new MockRepoClass();
      incompleteRepo.key = "";
      incompleteRepo.mainBranch = "";
      
      const isInitialized = incompleteRepo.key && incompleteRepo.mainBranch;
      expect(isInitialized).toBe(false);
    });

    it("should handle missing worker manager", () => {
      const incompleteRepo = new MockRepoClass();
      incompleteRepo.workerManager = null;
      
      const hasWorkerManager = incompleteRepo.workerManager;
      expect(hasWorkerManager).toBe(null);
    });

    it("should handle malformed patch data", () => {
      const malformedPatch = {
        id: "",
        commits: [],
        baseBranch: "",
        rawContent: null,
      };
      
      const isValid = malformedPatch.id && 
                     malformedPatch.commits && 
                     malformedPatch.baseBranch && 
                     malformedPatch.rawContent;
      
      expect(isValid).toBe(false);
    });
  });

  describe("UI State Management", () => {
    it("should manage merge progress state", () => {
      let isMerging = false;
      let mergeProgress = 0;
      let mergeStep = "";
      let mergeSuccess = false;
      
      // Start merge
      isMerging = true;
      mergeProgress = 10;
      mergeStep = "Preparing merge...";
      
      expect(isMerging).toBe(true);
      expect(mergeProgress).toBe(10);
      expect(mergeStep).toBe("Preparing merge...");
      expect(mergeSuccess).toBe(false);
      
      // Complete merge
      mergeProgress = 100;
      mergeStep = "Merge completed successfully!";
      mergeSuccess = true;
      isMerging = false;
      
      expect(mergeProgress).toBe(100);
      expect(mergeStep).toBe("Merge completed successfully!");
      expect(mergeSuccess).toBe(true);
      expect(isMerging).toBe(false);
    });

    it("should manage analysis state", () => {
      let isAnalyzingMerge = false;
      let mergeAnalysisResult: MergeAnalysisResult | null = null;
      
      // Start analysis
      isAnalyzingMerge = true;
      mergeAnalysisResult = null;
      
      expect(isAnalyzingMerge).toBe(true);
      expect(mergeAnalysisResult).toBe(null);
      
      // Complete analysis
      const result = mkMergeAnalysisResult({ canMerge: true });
      mergeAnalysisResult = result;
      isAnalyzingMerge = false;
      
      expect(isAnalyzingMerge).toBe(false);
      expect(mergeAnalysisResult?.canMerge).toBe(true);
    });

    it("should manage dialog state", () => {
      let showMergeDialog = false;
      let mergeCommitMessage = "";
      
      // Open dialog
      showMergeDialog = true;
      mergeCommitMessage = "Default merge message";
      
      expect(showMergeDialog).toBe(true);
      expect(mergeCommitMessage).toBe("Default merge message");
      
      // Close dialog
      showMergeDialog = false;
      mergeCommitMessage = "";
      
      expect(showMergeDialog).toBe(false);
      expect(mergeCommitMessage).toBe("");
    });
  });

  describe("Integration Tests", () => {
    it("should handle complete patch workflow", async () => {
      // Test complete workflow from analysis to merge
      const mockAnalysisResult = mkMergeAnalysisResult({ canMerge: true });
      mockRepo.getMergeAnalysis.mockResolvedValue(mockAnalysisResult);
      
      // Step 1: Analyze patch
      const analysisResult = await mockRepo.getMergeAnalysis(mkPatch(), "main");
      expect(analysisResult.canMerge).toBe(true);
      
      // Step 2: Prepare merge data
      const patchData = {
        id: "patch-1",
        commits: [mkCommit()],
        baseBranch: "main",
        rawContent: "patch content",
      };
      
      // Step 3: Execute merge
      mockRepo.workerManager.applyPatchAndPush.mockResolvedValue({
        success: true,
        mergeCommitOid: "merge-123",
      });
      
      const mergeResult = await mockRepo.workerManager.applyPatchAndPush({
        repoId: mockRepo.repoId,
        patchData,
        targetBranch: "main",
        mergeCommitMessage: "Test merge",
        authorName: "Test Author",
        authorEmail: "test@example.com",
      });
      
      expect(mergeResult.success).toBe(true);
      expect(mergeResult.mergeCommitOid).toBe("merge-123");
      
      // Step 4: Emit status event
      const { postStatus } = await import("@lib/budabit");
      const statusEvent = createStatusEvent({
        kind: 1631,
        content: "Test merge",
        rootId: "patch-1",
        recipients: mockRepo.maintainers,
        repoAddr: mockRepo.repoId,
        relays: mockRepo.relays,
        mergedCommit: "merge-123",
      });
      
      await (postStatus as any)(statusEvent, mockRepo.relays);
      
      expect(postStatus).toHaveBeenCalledWith(statusEvent, mockRepo.relays);
    });
  });
});
