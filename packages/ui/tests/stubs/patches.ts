// Test stubs and utilities for patches functionality
export type { Patch, Commit } from "@nostr-git/core";

// Mock patch navigation state
export class MockPatchNavigation {
  private currentIndex: number = 0;
  private patches: any[] = [];

  constructor(patches: any[] = []) {
    this.patches = patches;
  }

  getCurrentIndex() {
    return this.currentIndex;
  }

  getCurrentPatch() {
    return this.patches[this.currentIndex] || null;
  }

  hasPrevious() {
    return this.currentIndex > 0;
  }

  hasNext() {
    return this.currentIndex < this.patches.length - 1;
  }

  goToPrevious() {
    if (this.hasPrevious()) {
      this.currentIndex--;
      return this.getCurrentPatch();
    }
    return null;
  }

  goToNext() {
    if (this.hasNext()) {
      this.currentIndex++;
      return this.getCurrentPatch();
    }
    return null;
  }

  goToIndex(index: number) {
    if (index >= 0 && index < this.patches.length) {
      this.currentIndex = index;
      return this.getCurrentPatch();
    }
    return null;
  }

  reset() {
    this.currentIndex = 0;
  }
}

// Mock merge analysis state
export class MockMergeAnalysis {
  private isAnalyzing: boolean = false;
  private result: any = null;
  private error: any = null;
  private analysisTriggeredManually: boolean = false;

  async analyze(patch: any, targetBranch: string, manual: boolean = false) {
    this.isAnalyzing = true;
    this.analysisTriggeredManually = manual;
    
    // Simulate analysis delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      // Mock successful analysis
      this.result = {
        canMerge: true,
        hasConflicts: false,
        conflictFiles: [],
        patchCommits: patch.commits || [],
        analysis: "clean",
      };
      this.error = null;
    } catch (err) {
      this.error = err;
      this.result = null;
    } finally {
      this.isAnalyzing = false;
    }
    
    return this.result;
  }

  isAnalyzingMerge() {
    return this.isAnalyzing;
  }

  getAnalysisResult() {
    return this.result;
  }

  getAnalysisError() {
    return this.error;
  }

  wasManuallyTriggered() {
    return this.analysisTriggeredManually;
  }

  reset() {
    this.isAnalyzing = false;
    this.result = null;
    this.error = null;
    this.analysisTriggeredManually = false;
  }
}

// Mock merge workflow state
export class MockMergeWorkflow {
  private isMerging: boolean = false;
  private progress: number = 0;
  private step: string = "";
  private error: any = null;
  private success: boolean = false;
  private result: any = null;
  private showDialog: boolean = false;
  private commitMessage: string = "";

  async executeMerge(patchData: any, options: any = {}) {
    this.isMerging = true;
    this.progress = 0;
    this.step = "Preparing merge...";
    this.error = null;
    this.success = false;
    this.result = null;

    try {
      // Simulate merge progress
      this.progress = 25;
      this.step = "Analyzing patch...";
      await new Promise(resolve => setTimeout(resolve, 50));

      this.progress = 50;
      this.step = "Applying changes...";
      await new Promise(resolve => setTimeout(resolve, 50));

      this.progress = 75;
      this.step = "Creating merge commit...";
      await new Promise(resolve => setTimeout(resolve, 50));

      // Simulate successful merge
      this.progress = 100;
      this.step = "Merge completed successfully!";
      this.success = true;
      this.result = {
        success: true,
        mergeCommitOid: "merge-" + Math.random().toString(36).slice(2),
        pushedRemotes: ["origin"],
        warning: options.simulateWarning || null,
      };

    } catch (err) {
      this.error = err;
      this.step = "Merge failed";
      this.success = false;
    } finally {
      this.isMerging = false;
    }

    return this.result;
  }

  simulateFailure(errorMessage: string) {
    this.isMerging = true;
    this.progress = 50;
    this.step = "Merge failed";
    this.error = errorMessage;
    this.success = false;
    this.isMerging = false;
  }

  openDialog(message: string = "") {
    this.showDialog = true;
    this.commitMessage = message;
  }

  closeDialog() {
    this.showDialog = false;
    this.commitMessage = "";
  }

  getState() {
    return {
      isMerging: this.isMerging,
      progress: this.progress,
      step: this.step,
      error: this.error,
      success: this.success,
      result: this.result,
      showDialog: this.showDialog,
      commitMessage: this.commitMessage,
    };
  }

  reset() {
    this.isMerging = false;
    this.progress = 0;
    this.step = "";
    this.error = null;
    this.success = false;
    this.result = null;
    this.showDialog = false;
    this.commitMessage = "";
  }
}

// Mock comment system
export class MockCommentSystem {
  private comments: any[] = [];
  private subscribers: Set<(comments: any[]) => void> = new Set();

  addComment(comment: any) {
    this.comments.push({
      ...comment,
      id: comment.id || "comment-" + Math.random().toString(36).slice(2),
      created_at: comment.created_at || Math.floor(Date.now() / 1000),
    });
    this.notifySubscribers();
    return this.comments[this.comments.length - 1];
  }

  getComments(rootId: string) {
    return this.comments.filter(comment => 
      comment.tags?.some((tag: any) => tag[0] === "e" && tag[1] === rootId)
    );
  }

  subscribe(callback: (comments: any[]) => void) {
    this.subscribers.add(callback);
    callback(this.comments);
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers() {
    this.subscribers.forEach(callback => callback(this.comments));
  }

  clear() {
    this.comments = [];
    this.notifySubscribers();
  }
}

// Mock status event emitter
export class MockStatusEmitter {
  private emittedEvents: any[] = [];

  async emitStatus(statusData: any) {
    const event = {
      id: "status-" + Math.random().toString(36).slice(2),
      kind: statusData.kind,
      content: statusData.content,
      tags: statusData.tags || [],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: statusData.pubkey || "test-pubkey",
      sig: "test-signature",
    };

    this.emittedEvents.push(event);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));
    
    return event;
  }

  getEmittedEvents() {
    return this.emittedEvents;
  }

  getEventsByKind(kind: number) {
    return this.emittedEvents.filter(event => event.kind === kind);
  }

  clear() {
    this.emittedEvents = [];
  }
}

// Test utility functions
export const createTestPatchSet = (count: number = 3) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `patch-${i + 1}`,
    title: `Test Patch ${i + 1}`,
    description: `Description for test patch ${i + 1}`,
    author: {
      pubkey: `author-${i + 1}`,
      name: `Author ${i + 1}`,
    },
    created_at: Math.floor(Date.now() / 1000) + (i * 1000),
    commits: [
      {
        oid: `commit-${i + 1}-1`,
        message: `Commit ${i + 1}.1`,
        author: { name: `Author ${i + 1}`, email: `author${i + 1}@test.com` },
      },
    ],
    diff: [
      {
        from: `file-${i + 1}.txt`,
        to: `file-${i + 1}.txt`,
        changes: `+Line ${i + 1}\n-Line old ${i + 1}`,
      },
    ],
    baseBranch: "main",
    raw: {
      content: `Patch content ${i + 1}`,
      tags: [["t", "root"]],
    },
  }));
};

export const createTestStatusEvents = (patchId: string) => {
  return [
    {
      id: "status-1",
      kind: 1630, // OPEN
      content: "Open for review",
      tags: [["e", patchId, "", "root"]],
      created_at: Math.floor(Date.now() / 1000),
      pubkey: "user-1",
      sig: "sig1",
    },
    {
      id: "status-2", 
      kind: 1631, // APPLIED
      content: "Successfully merged",
      tags: [["e", patchId, "", "root"]],
      created_at: Math.floor(Date.now() / 1000) + 3600,
      pubkey: "maintainer-1",
      sig: "sig2",
    },
  ];
};

export const createTestComments = (patchId: string, count: number = 2) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `comment-${i + 1}`,
    kind: 1111,
    content: `Test comment ${i + 1}`,
    tags: [["e", patchId]],
    created_at: Math.floor(Date.now() / 1000) + (i * 100),
    pubkey: `user-${i + 1}`,
    sig: `sig${i + 1}`,
  }));
};
