import {
  IssueEvent,
  parseRepoAnnouncementEvent,
  parseRepoStateEvent,
  PatchEvent,
  RepoAnnouncement,
  RepoState,
  type RepoAnnouncementEvent,
  type RepoStateEvent,
} from "@nostr-git/shared-types";
import {
  type Branch,
  type MergeAnalysisResult,
} from "@nostr-git/core";
import { type Readable } from "svelte/store";
import { context } from "$lib/stores/context";
import { Token, tokens } from "$lib/stores/tokens";
import { WorkerManager, type WorkerProgressEvent, type CloneProgress } from "./WorkerManager";
import { CacheManager, MergeAnalysisCacheManager } from "./CacheManager";

export class Repo {
  repoEvent: RepoAnnouncementEvent = $state(undefined);
  repo: RepoAnnouncement | undefined = $state(undefined);
  repoStateEvent?: RepoStateEvent = $state(undefined);
  state: RepoState | undefined = $state(undefined);
  issues = $state<IssueEvent[]>([]);
  patches = $state<PatchEvent[]>([]);
  
  // Replace direct worker/api with WorkerManager
  private workerManager: WorkerManager;
  
  // Cache management
  private cacheManager: CacheManager;
  private mergeAnalysisCacheManager: MergeAnalysisCacheManager;

  tokens = $state<Token[]>([]);

  selectedBranch = $state<string | undefined>(undefined);
  #branchesFromRepo = $state<Branch[]>([]);
  #commits = $state<any[] | undefined>(undefined);
  #totalCommits = $state<number | undefined>(undefined);
  #currentPage = $state<number>(1);
  #commitsPerPage = 30;
  #hasMoreCommits = $state<boolean>(false);
  #loadingIds = {
    commits: null as string | null,
    branches: null as string | null,
    clone: null as string | null,
  };

  // Clone progress state
  cloneProgress = $state<CloneProgress>({
    isCloning: false,
    phase: "",
    progress: 0,
  });

  constructor({
    repoEvent,
    repoStateEvent,
    issues,
    patches,
  }: {
    repoEvent: Readable<RepoAnnouncementEvent>;
    repoStateEvent: Readable<RepoStateEvent>;
    issues: Readable<IssueEvent[]>;
    patches: Readable<PatchEvent[]>;
  }) {
    // Initialize WorkerManager first
    this.workerManager = new WorkerManager((progressEvent: WorkerProgressEvent) => {
      console.log(`Clone progress for ${progressEvent.repoId}: ${progressEvent.phase}`);
      this.cloneProgress = {
        isCloning: true,
        phase: progressEvent.phase,
        progress: progressEvent.progress,
      };
    });

    // Initialize cache managers
    this.cacheManager = new CacheManager();
    this.mergeAnalysisCacheManager = new MergeAnalysisCacheManager(this.cacheManager);

    // Store initial repo event for deferred branch loading
    let initialRepoEvent: RepoAnnouncementEvent | null = null;

    repoEvent.subscribe((event) => {
      if (event) {
        this.repoEvent = event;
        this.repo = parseRepoAnnouncementEvent(event);

        // Store the initial event for later processing
        if (!initialRepoEvent) {
          initialRepoEvent = event;
        }

        // Only load branches if WorkerManager is ready
        if (this.workerManager.isReady && !this.state) {
          this.#loadBranchesFromRepo(event);
        }
      }
    });

    repoStateEvent.subscribe((event) => {
      if (event) {
        this.state = parseRepoStateEvent(event);
      }
    });

    patches.subscribe((patchEvents) => {
      this.patches = patchEvents;
      // Only perform merge analysis if WorkerManager is ready
      if (this.workerManager.isReady) {
        this.#performMergeAnalysis(patchEvents);
      }
    });

    // Smart initialization - initialize WorkerManager and then load branches
    (async () => {
      try {
        // Initialize the WorkerManager first
        await this.workerManager.initialize();
        
        // Now that WorkerManager is ready, load branches if we have a repo event
        if (initialRepoEvent && !this.state) {
          await this.#loadBranchesFromRepo(initialRepoEvent);
        }
        
        const repoId = this.repoEvent?.id;
        const cloneUrls = [...(this.repo?.clone || [])];

        if (!repoId || !cloneUrls.length) {
          console.warn("Repository ID or clone URLs missing, skipping initialization");
          return;
        }

        this.#loadingIds.clone = context.loading("Initializing repository...");

        // Use smart initialization instead of always cloning
        const result = await this.workerManager.smartInitializeRepo({
          repoId,
          cloneUrls,
        });

        if (result.success) {
          context.update(this.#loadingIds.clone, {
            type: "success",
            message: result.fromCache ? "Repository loaded from cache" : "Repository initialized",
            duration: 3000,
          });

          // Load commits after successful initialization
          this.#loadCommitsFromRepo();
        } else {
          throw new Error(result.error || "Smart initialization failed");
        }
      } catch (error) {
        console.error("Git initialization failed:", error);

        if (this.#loadingIds.clone) {
          context.update(this.#loadingIds.clone, {
            type: "error",
            message: "Failed to initialize repository",
            details: error instanceof Error ? error.message : String(error),
            duration: 5000,
          });
        }
      }
    })();

    issues.subscribe((issueEvents) => {
      this.issues = issueEvents;
    });

    tokens.subscribe((tokens) => {
      this.tokens = tokens;
    });
  }

  // Computed properties
  get #mainBranch(): string {
    return this.state?.head || this.#branchesFromRepo[0]?.name || "main";
  }

  get #branches(): Branch[] {
    return this.#branchesFromRepo;
  }

  get #maintainers(): string[] {
    return this.repo?.maintainers || [];
  }

  async #getCachedMergeAnalysis(patch: PatchEvent, targetBranch: string): Promise<MergeAnalysisResult | null> {
    return await this.mergeAnalysisCacheManager.get(patch, targetBranch, this.repo?.id || '');
  }

  async #cacheMergeAnalysis(patch: PatchEvent, targetBranch: string, result: MergeAnalysisResult): Promise<void> {
    await this.mergeAnalysisCacheManager.set(patch, targetBranch, this.repo?.id || '', result);
  }

  async #removeCachedMergeAnalysis(patchId: string): Promise<void> {
    await this.mergeAnalysisCacheManager.remove(patchId);
  }



  #cleanupMergeAnalysisCache(): void {
    this.mergeAnalysisCacheManager.cleanup();
  }

  // Public API for getting merge analysis result
  async getMergeAnalysis(patchId: string): Promise<MergeAnalysisResult | undefined> {
    const result = await this.mergeAnalysisCacheManager.has(patchId);
    if (!result) return undefined;
    
    // We need the patch object to get the cached result, but this is a simplified API
    // In practice, the patch pages should call this with the full patch object
    console.warn('getMergeAnalysis called with only patchId - consider using the full patch object');
    return undefined;
  }

  async hasMergeAnalysis(patchId: string): Promise<boolean> {
    return await this.mergeAnalysisCacheManager.has(patchId);
  }

  // Public API for force refresh merge analysis for a patch
  async refreshMergeAnalysis(patch: PatchEvent): Promise<MergeAnalysisResult | null> {
    if (!this.repoEvent) return null;

    const repoId = this.repoEvent.id;
    const targetBranch = this.mainBranch?.split("/").pop() || "main";

    try {
      // Remove from cache to force refresh
      await this.#removeCachedMergeAnalysis(patch.id);

      // Parse the patch for analysis
      const { parseGitPatchFromEvent } = await import("@nostr-git/core");
      const parsedPatch = parseGitPatchFromEvent(patch);
      
      // Use the existing worker API instead of creating a new one
      const result = await this.workerManager.analyzePatchMerge({
        repoId,
        patchData: {
          id: parsedPatch.id,
          commits: parsedPatch.commits.map(c => ({
            oid: c.oid,
            message: c.message,
            author: { name: c.author.name, email: c.author.email }
          })),
          baseBranch: parsedPatch.baseBranch,
          rawContent: parsedPatch.raw.content
        },
        targetBranch
      });

      // Cache the new result
      await this.#cacheMergeAnalysis(patch, targetBranch, result);
      
      return result;
    } catch (error) {
      console.error(`Failed to refresh merge analysis for patch ${patch.id}:`, error);
      return null;
    }
  }

  // Public API for clearing merge analysis cache
  async clearMergeAnalysisCache(): Promise<void> {
    await this.mergeAnalysisCacheManager.clear();
    console.log('Cleared all merge analysis cache entries');
  }

  setCommitsPerPage(count: number) {
    if (count > 0 && count <= 100) {
      // Enforce reasonable limits
      this.#commitsPerPage = count;
      // Reset pagination when page size changes
      this.#currentPage = 1;
      this.#commits = undefined;
      this.#totalCommits = undefined;
      this.#hasMoreCommits = false;
    }
  }

  async #loadCommitsFromRepo() {
    if (!this.repoEvent) return;

    try {
      const repoId = this.repoEvent.id;
      const cloneUrls = [...(this.repo?.clone || [])];

      if (!repoId || !cloneUrls.length) {
        console.warn("Repository ID or clone URLs missing, skipping initialization");
        return;
      }

      this.#loadingIds.clone = context.loading("Initializing repository...");

      // Use smart initialization instead of always cloning
      const result = await this.workerManager.smartInitializeRepo({
        repoId,
        cloneUrls,
      });

      if (result.success) {
        context.update(this.#loadingIds.clone, {
          type: "success",
          message: result.fromCache ? "Repository loaded from cache" : "Repository initialized",
          duration: 3000,
        });

        // Load commits after successful initialization
        await this.#loadCommits();
      } else {
        throw new Error(result.error || "Smart initialization failed");
      }
    } catch (error) {
      console.error("Git initialization failed:", error);

      if (this.#loadingIds.clone) {
        context.update(this.#loadingIds.clone, {
          type: "error",
          message: "Failed to initialize repository",
          details: error instanceof Error ? error.message : String(error),
          duration: 5000,
        });
      }
    }
  }

  async #loadCommits() {
    if (!this.repoEvent || !this.mainBranch) return;

    try {
      // Clear any previous error
      if (this.#loadingIds.commits) {
        context.remove(this.#loadingIds.commits);
      }

      this.#loadingIds.commits = context.loading("Loading commits...");

      const branchName = this.mainBranch.split("/").pop() || "main";
      const repoId = this.repoEvent.id;

      // Calculate the depth needed for current page
      const requiredDepth = this.#commitsPerPage * this.#currentPage;

      // Check current data level
      const dataLevel = await this.workerManager.getRepoDataLevel(repoId);

      // For commit history, we need full clone to avoid NotFoundError
      // Don't rely on shallow clones for commit operations
      if (dataLevel !== "full") {
        console.log(`Upgrading to full clone for commit history (current: ${dataLevel})`);
        const upgradeResult = await this.workerManager.ensureFullClone({
          repoId,
          branch: branchName,
          depth: Math.max(requiredDepth, 100), // Ensure sufficient depth
        });

        if (!upgradeResult.success) {
          throw new Error(`Failed to upgrade to full clone: ${upgradeResult.error}`);
        }
      }

      // Load commits with the worker's optimized method
      const commitsResult = await this.workerManager.getCommitHistory({
        repoId,
        branch: branchName,
        depth: requiredDepth,
      });

      if (commitsResult.success) {
        const allCommits = commitsResult.commits || [];
        const startIndex = (this.#currentPage - 1) * this.#commitsPerPage;
        const endIndex = startIndex + this.#commitsPerPage;

        // Extract commits for current page
        const pageCommits = allCommits.slice(startIndex, endIndex);

        // If it's the first page, replace the commits, otherwise append
        this.#commits =
          this.#currentPage === 1 ? pageCommits : [...(this.#commits || []), ...pageCommits];

        this.#hasMoreCommits = endIndex < allCommits.length;

        // Only fetch total count on first load and cache it
        if (this.#currentPage === 1 && this.#totalCommits === undefined) {
          // Use the commit count from the result if available, otherwise get it separately
          if (allCommits.length < requiredDepth) {
            // If we got fewer commits than requested, we have all of them
            this.#totalCommits = allCommits.length;
          } else {
            // Get total count separately (this might be cached)
            const countResult = await this.workerManager.getCommitCount({
              repoId,
              branch: branchName,
            });

            if (countResult.success) {
              this.#totalCommits = countResult.count;
            }
          }
        }

        // Update loading message to success
        if (this.#loadingIds.commits) {
          const message =
            this.#currentPage === 1
              ? `Loaded ${pageCommits.length} commits`
              : `Loaded ${pageCommits.length} more commits`;

          context.update(this.#loadingIds.commits, {
            type: "success",
            message,
            duration: 2000,
          });
          this.#loadingIds.commits = null;
        }
      } else {
        throw new Error(commitsResult.error);
      }
    } catch (error) {
      console.error("Failed to load commits:", error);

      if (this.#loadingIds.commits) {
        context.update(this.#loadingIds.commits, {
          type: "error",
          message: "Failed to load commits",
          details: error instanceof Error ? error.message : "Unknown error",
          duration: 5000,
        });
        this.#loadingIds.commits = null;
      } else {
        context.error(
          "Failed to load commits",
          error instanceof Error ? error.message : "Unknown error"
        );
      }

      this.#commits = [];
      this.#hasMoreCommits = false;
    }
  }

  async #loadBranchesFromRepo(repoEvent: RepoAnnouncementEvent) {
    try {
      // Clear any previous loading message
      if (this.#loadingIds.branches) {
        context.remove(this.#loadingIds.branches);
      }

      this.#loadingIds.branches = context.loading("Loading branches...");

      const repoBranches = await this.workerManager.listBranchesFromEvent({ repoEvent });
      this.#branchesFromRepo = repoBranches.map((branch: Branch) => ({
        name: branch.name,
        commit: branch.oid,
        lineage: branch.isHead,
        isHead: branch.isHead,
      }));

      // Update loading message to success
      if (this.#loadingIds.branches) {
        context.update(this.#loadingIds.branches, {
          type: "success",
          message: `Loaded ${this.#branchesFromRepo.length} branches`,
          duration: 2000,
        });
        this.#loadingIds.branches = null;
      }
    } catch (error) {
      console.error("Error loading branches:", error);

      if (this.#loadingIds.branches) {
        context.update(this.#loadingIds.branches, {
          type: "error",
          message: "Failed to load branches",
          details: error instanceof Error ? error.message : "Unknown error",
          duration: 5000,
        });
        this.#loadingIds.branches = null;
      } else {
        context.error(
          "Failed to load branches",
          error instanceof Error ? error.message : "Unknown error"
        );
      }

      this.#branchesFromRepo = [];
    }
  }

  get repoId() {
    return this.repo?.repoId;
  }

  get mainBranch() {
    return this.#mainBranch;
  }

  get branches() {
    return this.#branches;
  }

  get maintainers() {
    return this.#maintainers;
  }

  get relays() {
    return this.repo?.relays;
  }

  get commits() {
    if (!this.#commits) {
      this.#loadCommits();
    }
    return this.#commits || [];
  }

  get isLoading() {
    return Object.values(this.#loadingIds).some((id) => id !== null);
  }

  get totalCommits() {
    return this.#totalCommits;
  }

  get currentPage() {
    return this.#currentPage;
  }

  get commitsPerPage() {
    return this.#commitsPerPage;
  }

  // Get the current pagination state
  get pagination() {
    return {
      page: this.#currentPage,
      pageSize: this.#commitsPerPage,
      total: this.#totalCommits,
      hasMore: this.#hasMoreCommits,
      loading: this.isLoading,
    };
  }

  get hasMoreCommits() {
    return this.#hasMoreCommits;
  }

  async loadMoreCommits() {
    if (this.#hasMoreCommits && !this.isLoading) {
      this.#currentPage++;
      await this.#loadCommits();
    }
  }

  async loadPage(page: number) {
    this.#currentPage = page;
    await this.#loadCommits();
  }

  async listRepoFiles({ branch, path }: { branch: string; path?: string }) {
    const files = await this.workerManager.listRepoFilesFromEvent({
      repoEvent: this.repoEvent!,
      branch,
      path,
    });
    return files;
  }

  async getFileContent({
    branch,
    path,
    commit,
  }: {
    branch?: string;
    path: string;
    commit?: string;
  }) {
    const content = await this.workerManager.getRepoFileContentFromEvent({
      repoEvent: this.repoEvent!,
      branch: branch || this.mainBranch.split("/").pop()!,
      commit,
      path,
    });
    return content;
  }

  /**
   * Completely reset the git repo: delete from FS, reload, and re-initialize all state.
   * Shows loading/error/success in context store. Triggers a full reload of branches, commits, etc.
   */
  async resetRepo() {
    const repoId = this.repoEvent?.id;
    if (!repoId) {
      context.error("Cannot reset: repoId missing");
      return;
    }
    // Show loading
    const loadingId = context.loading("Resetting repository...");
    try {
      // Call worker to delete repo (this now also clears cache)
      const result = await this.workerManager.deleteRepo({ repoId });
      if (!result.success) {
        throw new Error(result.error || "Failed to delete repo");
      }
      // Re-parse event and trigger fresh initialization
      if (this.repoEvent) {
        this.repo = parseRepoAnnouncementEvent(this.repoEvent);
        // Force re-initialization (bypasses cache)
        const cloneUrls = [...(this.repo?.clone || [])];
        this.#loadingIds.clone = context.loading("Re-initializing repository...");

        const initResult = await this.workerManager.smartInitializeRepo({
          repoId,
          cloneUrls,
          forceUpdate: true, // Force fresh initialization
        });

        if (initResult.success) {
          context.update(loadingId, {
            type: "success",
            message: "Repository reset and reloaded",
            duration: 3000,
          });
        } else {
          throw new Error(initResult.error || "Failed to re-initialize");
        }

        this.#loadingIds.clone = null;
        // Reset state and reload
        this.#commits = undefined;
        this.#totalCommits = undefined;
        this.#currentPage = 1;
        this.#hasMoreCommits = false;

        // Reload branches and commits
        await this.#loadBranchesFromRepo(this.repoEvent);
        await this.#loadCommits();
      } else {
        context.update(loadingId, {
          type: "warning",
          message: "Repository reset, but announcement event missing",
          duration: 4000,
        });
      }
    } catch (error) {
      context.update(loadingId, {
        type: "error",
        message: "Failed to reset repository",
        details: error instanceof Error ? error.message : String(error),
        duration: 5000,
      });
      // Do not throw further; UI should recover gracefully
    }
  }

  async fileExistsAtCommit({
    branch,
    path,
    commit,
  }: {
    branch?: string;
    path: string;
    commit?: string;
  }) {
    return await this.workerManager.fileExistsAtCommit({
      repoEvent: this.repoEvent!,
      branch: branch || this.mainBranch.split("/").pop()!,
      commit,
      path,
    });
  }

  async getCommitInfo({ commit }: { commit: string }) {
    return await this.workerManager.getCommitInfo({
      repoEvent: this.repoEvent!,
      commit,
    });
  }

  async getFileHistory({
    path,
    branch,
    maxCount,
  }: {
    path: string;
    branch?: string;
    maxCount?: number;
  }) {
    return await this.workerManager.getFileHistory({
      repoEvent: this.repoEvent!,
      path,
      branch: branch || this.mainBranch.split("/").pop()!,
      maxCount,
    });
  }

  async getCommitHistory({ branch, depth }: { branch?: string; depth?: number }) {
    return await this.workerManager.getCommitHistory({
      repoId: this.repoEvent.id,
      branch: branch || this.mainBranch.split("/").pop()!,
      depth,
    });
  }

  dispose() {
    this.workerManager.dispose();
  }

  // Perform background merge analysis for patches
  async #performMergeAnalysis(patches: PatchEvent[]) {
    if (!this.repoEvent || !patches.length) return;

    const repoId = this.repoEvent.id;
    const targetBranch = this.mainBranch?.split("/").pop() || "main";

    // Clean up expired cache entries
    this.#cleanupMergeAnalysisCache();

    // Process patches in batches to avoid overwhelming the system
    const batchSize = 3;
    
    // Process batches sequentially to avoid creating too many workers
    for (let i = 0; i < patches.length; i += batchSize) {
      const batch = patches.slice(i, i + batchSize);
      
      // Process batch with delay to avoid blocking
      setTimeout(async () => {
        // Process patches in this batch sequentially using the shared worker
        for (const patch of batch) {
          try {
            // Check if we already have a cached result
            const cachedResult = await this.#getCachedMergeAnalysis(patch, targetBranch);
            if (cachedResult) {
              console.log(`Using cached merge analysis for patch ${patch.id}`);
              continue;
            }

            console.log(`Analyzing merge for patch ${patch.id} in background`);
            
            // Parse the patch for analysis
            const { parseGitPatchFromEvent } = await import("@nostr-git/core");
            const parsedPatch = parseGitPatchFromEvent(patch);
            
            // Use the existing worker API instead of creating a new one
            const result = await this.workerManager.analyzePatchMerge({
              repoId,
              patchData: {
                id: parsedPatch.id,
                commits: parsedPatch.commits.map(c => ({
                  oid: c.oid,
                  message: c.message,
                  author: { name: c.author.name, email: c.author.email }
                })),
                baseBranch: parsedPatch.baseBranch,
                rawContent: parsedPatch.raw.content
              },
              targetBranch
            });

            // Cache the result
            await this.#cacheMergeAnalysis(patch, targetBranch, result);
            
            console.log(`Background merge analysis completed for patch ${patch.id}`);
          } catch (error) {
            console.warn(`Background merge analysis failed for patch ${patch.id}:`, error);
            // Don't cache error results as they might be temporary
          }
        }
      }, i * 200); // Stagger batches by 200ms to give more breathing room
    }
  }
}
