// Test runner utilities for patches detail page tests
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { Patch, Commit, MergeAnalysisResult } from "@nostr-git/core";
import {
  MockPatchNavigation,
  MockMergeAnalysis,
  MockMergeWorkflow,
  MockCommentSystem,
  MockStatusEmitter,
  createTestPatchSet,
  createTestStatusEvents,
  createTestComments,
} from "./stubs/patches";

// Test configuration
export interface TestConfig {
  patchCount: number;
  commentCount: number;
  simulateErrors: boolean;
  simulateWarnings: boolean;
  delay: number;
}

export class PatchesDetailTestRunner {
  private navigation: MockPatchNavigation;
  private analysis: MockMergeAnalysis;
  private workflow: MockMergeWorkflow;
  private comments: MockCommentSystem;
  private statusEmitter: MockStatusEmitter;
  private config: TestConfig;

  constructor(config: Partial<TestConfig> = {}) {
    this.config = {
      patchCount: 3,
      commentCount: 2,
      simulateErrors: false,
      simulateWarnings: false,
      delay: 0,
      ...config,
    };

    const patches = createTestPatchSet(this.config.patchCount);
    this.navigation = new MockPatchNavigation(patches);
    this.analysis = new MockMergeAnalysis();
    this.workflow = new MockMergeWorkflow();
    this.comments = new MockCommentSystem();
    this.statusEmitter = new MockStatusEmitter();

    // Add test comments
    const testComments = createTestComments(patches[0].id, this.config.commentCount);
    testComments.forEach(comment => this.comments.addComment(comment));
  }

  // Test runner methods
  async runNavigationTests() {
    describe("Patch Navigation Tests", () => {
      beforeEach(() => {
        this.navigation.reset();
      });

      it("should initialize with first patch selected", () => {
        expect(this.navigation.getCurrentIndex()).toBe(0);
        expect(this.navigation.getCurrentPatch()?.id).toBe("patch-1");
      });

      it("should navigate forward through patches", () => {
        const initialPatch = this.navigation.getCurrentPatch();
        
        this.navigation.goToNext();
        expect(this.navigation.getCurrentIndex()).toBe(1);
        expect(this.navigation.getCurrentPatch()?.id).toBe("patch-2");
        expect(this.navigation.getCurrentPatch()).not.toBe(initialPatch);
      });

      it("should navigate backward through patches", () => {
        this.navigation.goToIndex(2); // Go to last patch
        expect(this.navigation.getCurrentIndex()).toBe(2);
        
        this.navigation.goToPrevious();
        expect(this.navigation.getCurrentIndex()).toBe(1);
        expect(this.navigation.getCurrentPatch()?.id).toBe("patch-2");
      });

      it("should handle boundary conditions correctly", () => {
        // Test first patch boundary
        expect(this.navigation.hasPrevious()).toBe(false);
        expect(this.navigation.goToPrevious()).toBe(null);
        
        // Test last patch boundary
        this.navigation.goToIndex(this.config.patchCount - 1);
        expect(this.navigation.hasNext()).toBe(false);
        expect(this.navigation.goToNext()).toBe(null);
      });

      it("should jump to specific patch index", () => {
        const targetIndex = 1;
        const patch = this.navigation.goToIndex(targetIndex);
        
        expect(patch?.id).toBe("patch-2");
        expect(this.navigation.getCurrentIndex()).toBe(targetIndex);
      });

      it("should handle invalid index jumps", () => {
        const currentPatch = this.navigation.getCurrentPatch();
        
        expect(this.navigation.goToIndex(-1)).toBe(null);
        expect(this.navigation.goToIndex(999)).toBe(null);
        expect(this.navigation.getCurrentPatch()).toBe(currentPatch);
      });
    });
  }

  async runAnalysisTests() {
    describe("Patch Analysis Tests", () => {
      beforeEach(() => {
        this.analysis.reset();
      });

      it("should perform manual analysis", async () => {
        const patch = this.navigation.getCurrentPatch();
        const result = await this.analysis.analyze(patch, "main", true);
        
        expect(result).toBeDefined();
        expect(result.canMerge).toBe(true);
        expect(this.analysis.wasManuallyTriggered()).toBe(true);
      });

      it("should perform automatic analysis", async () => {
        const patch = this.navigation.getCurrentPatch();
        const result = await this.analysis.analyze(patch, "main", false);
        
        expect(result).toBeDefined();
        expect(result.canMerge).toBe(true);
        expect(this.analysis.wasManuallyTriggered()).toBe(false);
      });

      it("should handle analysis state transitions", async () => {
        const patch = this.navigation.getCurrentPatch();
        
        // Start analysis
        const analysisPromise = this.analysis.analyze(patch, "main", true);
        expect(this.analysis.isAnalyzingMerge()).toBe(true);
        expect(this.analysis.getAnalysisResult()).toBe(null);
        
        // Wait for completion
        const result = await analysisPromise;
        expect(this.analysis.isAnalyzingMerge()).toBe(false);
        expect(this.analysis.getAnalysisResult()).toBe(result);
      });

      it("should handle analysis errors", async () => {
        // Mock analysis failure
        vi.spyOn(this.analysis, 'analyze').mockRejectedValueOnce(
          new Error("Analysis failed")
        );
        
        try {
          await this.analysis.analyze(this.navigation.getCurrentPatch(), "main", true);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe("Analysis failed");
        }
      });
    });
  }

  async runMergeWorkflowTests() {
    describe("Merge Workflow Tests", () => {
      beforeEach(() => {
        this.workflow.reset();
      });

      it("should execute complete merge workflow", async () => {
        const patchData = {
          id: "patch-1",
          commits: [{ oid: "commit-1", message: "Test commit" }],
          baseBranch: "main",
          rawContent: "patch content",
        };

        const result = await this.workflow.executeMerge(patchData);
        
        expect(result.success).toBe(true);
        expect(result.mergeCommitOid).toBeDefined();
        expect(result.pushedRemotes).toContain("origin");
      });

      it("should handle merge progress updates", async () => {
        const patchData = { id: "patch-1", commits: [], baseBranch: "main", rawContent: "" };
        
        const mergePromise = this.workflow.executeMerge(patchData);
        
        // Check intermediate states
        await new Promise(resolve => setTimeout(resolve, 25));
        expect(this.workflow.getState().progress).toBeGreaterThan(0);
        expect(this.workflow.getState().isMerging).toBe(true);
        
        await mergePromise;
        expect(this.workflow.getState().progress).toBe(100);
        expect(this.workflow.getState().success).toBe(true);
      });

      it("should handle merge failures", () => {
        this.workflow.simulateFailure("Merge conflict detected");
        
        const state = this.workflow.getState();
        expect(state.success).toBe(false);
        expect(state.error).toBe("Merge conflict detected");
        expect(state.step).toBe("Merge failed");
      });

      it("should manage merge dialog state", () => {
        const message = "Custom merge message";
        
        this.workflow.openDialog(message);
        expect(this.workflow.getState().showDialog).toBe(true);
        expect(this.workflow.getState().commitMessage).toBe(message);
        
        this.workflow.closeDialog();
        expect(this.workflow.getState().showDialog).toBe(false);
        expect(this.workflow.getState().commitMessage).toBe("");
      });
    });
  }

  async runCommentTests() {
    describe("Comment System Tests", () => {
      beforeEach(() => {
        this.comments.clear();
      });

      it("should add and retrieve comments", () => {
        const patchId = "patch-1";
        const comment = {
          content: "Test comment",
          pubkey: "user-1",
          tags: [["e", patchId]],
        };

        const addedComment = this.comments.addComment(comment);
        expect(addedComment.id).toBeDefined();
        expect(addedComment.content).toBe("Test comment");

        const retrievedComments = this.comments.getComments(patchId);
        expect(retrievedComments).toHaveLength(1);
        expect(retrievedComments[0].content).toBe("Test comment");
      });

      it("should handle comment subscriptions", () => {
        const callback = vi.fn();
        const unsubscribe = this.comments.subscribe(callback);
        
        expect(callback).toHaveBeenCalledWith([]);
        
        const comment = { content: "New comment", tags: [["e", "patch-1"]] };
        this.comments.addComment(comment);
        
        expect(callback).toHaveBeenCalledTimes(2); // Initial call + update
        expect(callback).toHaveBeenLastCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ content: "New comment" })
          ])
        );
        
        unsubscribe();
        this.comments.addComment({ content: "Another comment", tags: [["e", "patch-1"]] });
        expect(callback).toHaveBeenCalledTimes(2); // Should not be called again
      });

      it("should filter comments by root ID", () => {
        const comment1 = { content: "Comment 1", tags: [["e", "patch-1"]] };
        const comment2 = { content: "Comment 2", tags: [["e", "patch-2"]] };
        const comment3 = { content: "Comment 3", tags: [["e", "patch-1"]] };

        this.comments.addComment(comment1);
        this.comments.addComment(comment2);
        this.comments.addComment(comment3);

        const patch1Comments = this.comments.getComments("patch-1");
        const patch2Comments = this.comments.getComments("patch-2");

        expect(patch1Comments).toHaveLength(2);
        expect(patch2Comments).toHaveLength(1);
        expect(patch1Comments.map(c => c.content)).toEqual(["Comment 1", "Comment 3"]);
        expect(patch2Comments[0].content).toBe("Comment 2");
      });
    });
  }

  async runStatusEventTests() {
    describe("Status Event Tests", () => {
      beforeEach(() => {
        this.statusEmitter.clear();
      });

      it("should emit status events", async () => {
        const statusData = {
          kind: 1631, // APPLIED
          content: "Patch applied successfully",
          tags: [["e", "patch-1", "", "root"]],
          pubkey: "maintainer-1",
        };

        const event = await this.statusEmitter.emitStatus(statusData);
        
        expect(event.id).toBeDefined();
        expect(event.kind).toBe(1631);
        expect(event.content).toBe("Patch applied successfully");
        
        const emittedEvents = this.statusEmitter.getEmittedEvents();
        expect(emittedEvents).toHaveLength(1);
        expect(emittedEvents[0]).toBe(event);
      });

      it("should filter events by kind", async () => {
        await this.statusEmitter.emitStatus({ kind: 1630, content: "Open" });
        await this.statusEmitter.emitStatus({ kind: 1631, content: "Applied" });
        await this.statusEmitter.emitStatus({ kind: 1632, content: "Closed" });

        const appliedEvents = this.statusEmitter.getEventsByKind(1631);
        expect(appliedEvents).toHaveLength(1);
        expect(appliedEvents[0].content).toBe("Applied");
      });
    });
  }

  async runIntegrationTests() {
    describe("Integration Tests", () => {
      it("should handle complete patch lifecycle", async () => {
        // 1. Start with first patch
        expect(this.navigation.getCurrentPatch()?.id).toBe("patch-1");
        
        // 2. Analyze patch
        const patch = this.navigation.getCurrentPatch();
        const analysisResult = await this.analysis.analyze(patch, "main", true);
        expect(analysisResult.canMerge).toBe(true);
        
        // 3. Navigate through patches
        this.navigation.goToNext();
        expect(this.navigation.getCurrentPatch()?.id).toBe("patch-2");
        
        // 4. Add comment
        const comment = {
          content: "Review comment",
          pubkey: "reviewer-1",
          tags: [["e", this.navigation.getCurrentPatch()?.id || ""]],
        };
        this.comments.addComment(comment);
        
        const comments = this.comments.getComments(this.navigation.getCurrentPatch()?.id || "");
        expect(comments).toHaveLength(1);
        expect(comments[0].content).toBe("Review comment");
        
        // 5. Return to first patch and merge
        this.navigation.goToIndex(0);
        const patchData = {
          id: this.navigation.getCurrentPatch()?.id,
          commits: this.navigation.getCurrentPatch()?.commits || [],
          baseBranch: "main",
          rawContent: this.navigation.getCurrentPatch()?.raw?.content || "",
        };
        
        const mergeResult = await this.workflow.executeMerge(patchData);
        expect(mergeResult.success).toBe(true);
        
        // 6. Emit status event
        const statusEvent = await this.statusEmitter.emitStatus({
          kind: 1631,
          content: "Patch set merged successfully",
          tags: [["e", this.navigation.getCurrentPatch()?.id || "", "", "root"]],
          pubkey: "maintainer-1",
        });
        
        expect(statusEvent.kind).toBe(1631);
        expect(this.statusEmitter.getEmittedEvents()).toHaveLength(1);
      });

      it("should handle error scenarios gracefully", async () => {
        // Test analysis failure
        vi.spyOn(this.analysis, 'analyze').mockRejectedValueOnce(
          new Error("Repository not found")
        );
        
        try {
          await this.analysis.analyze(this.navigation.getCurrentPatch(), "main", true);
        } catch (error) {
          expect((error as Error).message).toBe("Repository not found");
        }
        
        // Test merge failure
        this.workflow.simulateFailure("Permission denied");
        const state = this.workflow.getState();
        expect(state.success).toBe(false);
        expect(state.error).toBe("Permission denied");
      });
    });
  }

  // Main test runner
  async runAllTests() {
    console.log("🧪 Running Patches Detail Page Tests...");
    
    await this.runNavigationTests();
    await this.runAnalysisTests();
    await this.runMergeWorkflowTests();
    await this.runCommentTests();
    await this.runStatusEventTests();
    await this.runIntegrationTests();
    
    console.log("✅ All tests completed!");
  }
}

// Export convenience function for running tests
export const runPatchesDetailTests = (config?: Partial<TestConfig>) => {
  const runner = new PatchesDetailTestRunner(config);
  return runner.runAllTests();
};
