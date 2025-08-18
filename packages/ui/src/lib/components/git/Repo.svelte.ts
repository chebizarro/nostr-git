import {
  IssueEvent,
  parseRepoAnnouncementEvent,
  parseRepoStateEvent,
  PatchEvent,
  RepoAnnouncement,
  RepoState,
  type RepoAnnouncementEvent,
  type RepoStateEvent,
  createRepoAnnouncementEvent,
  createRepoStateEvent,
} from "@nostr-git/shared-types";
import {
  type MergeAnalysisResult,
} from "@nostr-git/core";
import { canonicalRepoKey } from "@nostr-git/core";
import { type Readable } from "svelte/store";
import { context } from "$lib/stores/context";
import { Token, tokens } from "$lib/stores/tokens";
import { WorkerManager, type WorkerProgressEvent, type CloneProgress } from "./WorkerManager";
import { CacheManager, MergeAnalysisCacheManager, CacheType } from './CacheManager';
import { PatchManager } from "./PatchManager";
import { CommitManager } from "./CommitManager";
import { BranchManager } from "./BranchManager";
import { FileManager } from "./FileManager";

export class Repo {
  repoEvent: RepoAnnouncementEvent | undefined = $state(undefined);
  repo: RepoAnnouncement | undefined = $state(undefined);
  repoStateEvent: RepoStateEvent | undefined = $state(undefined);
  state: RepoState | undefined = $state(undefined);
  issues = $state<IssueEvent[]>([]);
  patches = $state<PatchEvent[]>([]);
  // Stable, canonical key used for all UI caches and internal maps
  canonicalKey: string = $state("");
  
  // Manager components
  workerManager!: WorkerManager;
  cacheManager!: CacheManager;
  mergeAnalysisCacheManager!: MergeAnalysisCacheManager;
  patchManager!: PatchManager;
  commitManager!: CommitManager;
  branchManager!: BranchManager;
  fileManager!: FileManager;

  tokens = $state<Token[]>([]);

  // Cached resolved branch to avoid redundant fallback iterations
  #resolvedDefaultBranch: string | null = null;
  #branchResolutionTimestamp: number = 0;
  #branchResolutionTTL = 5 * 60 * 1000; // 5 minutes cache TTL

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

    // Keep worker auth config synced with token store updates
    tokens.subscribe(async (t) => {
      try {
        await this.workerManager.setAuthConfig({ tokens: t });
        if (t?.length) {
          console.log('🔐 Updated git auth tokens for', t.length, 'hosts');
        } else {
          console.log('🔐 Cleared git auth tokens');
        }
      } catch (e) {
        console.warn('🔐 Failed to update worker auth config from token changes:', e);
      }
    });

    // Initialize cache managers
    this.cacheManager = new CacheManager();
    
    // Register cache configurations for file operations
    this.cacheManager.registerCache('file_content', {
      type: CacheType.MEMORY,
      keyPrefix: 'file_content_',
      defaultTTL: 10 * 60 * 1000, // 10 minutes
      maxSize: 100,
      autoCleanup: true,
      cleanupInterval: 5 * 60 * 1000 // 5 minutes
    });
    
    this.cacheManager.registerCache('file_listing', {
      type: CacheType.MEMORY,
      keyPrefix: 'file_listing_',
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      maxSize: 50,
      autoCleanup: true,
      cleanupInterval: 5 * 60 * 1000 // 5 minutes
    });
    
    this.mergeAnalysisCacheManager = new MergeAnalysisCacheManager(this.cacheManager);
    
    // Initialize PatchManager with dependencies
    this.patchManager = new PatchManager(
      this.workerManager,
      this.mergeAnalysisCacheManager
    );

    // Initialize CommitManager with dependencies
    this.commitManager = new CommitManager(
      this.workerManager,
      this.cacheManager,
      {
        defaultCommitsPerPage: 30,
        enableCaching: true,
      }
    );

    // Initialize BranchManager with dependencies
    this.branchManager = new BranchManager(
      this.workerManager,
      this.cacheManager,
      {
        enableCaching: true,
        autoRefresh: false,
      }
    );

    // Initialize FileManager
    this.fileManager = new FileManager(
      this.workerManager,
      this.cacheManager,
      {
        enableCaching: true,
        contentCacheTTL: 10 * 60 * 1000, // 10 minutes
        listingCacheTTL: 5 * 60 * 1000, // 5 minutes
        maxCacheFileSize: 1024 * 1024, // 1MB
        autoCleanup: true
      }
    );

    // Store initial repo event for deferred branch loading
    let initialRepoEvent: RepoAnnouncementEvent | null = null;

    repoEvent.subscribe((event) => {
      if (event) {
        this.repoEvent = event;
        this.repo = parseRepoAnnouncementEvent(event);
        const repoId = `${this.repoEvent.pubkey}:${this.repo.name}`;
        this.canonicalKey = canonicalRepoKey(repoId);
        this.commitManager.setRepoKeys({
          canonicalKey: this.canonicalKey,
          workerRepoId: this.repoEvent.id,
        });
        
        // Invalidate branch cache when repo event changes
        this.invalidateBranchCache();

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
        this.repoStateEvent = event; // Set the reactive state
        this.state = parseRepoStateEvent(event);
        
        // Process the Repository State event in BranchManager
        this.branchManager.processRepoStateEvent(event);
        
        // Invalidate branch cache when repo state changes
        this.invalidateBranchCache();
        

      }
    });

    patches.subscribe((patchEvents) => {
      this.patches = patchEvents;
      // Only perform merge analysis if WorkerManager is ready
      if (this.workerManager.isReady) {
        this.#performMergeAnalysis(patchEvents);
      }
    });

    tokens.subscribe(async (tokenList) => {
      this.tokens = tokenList;
      console.log('🔐 Token store updated in Repo:', tokenList.length, 'tokens');
      
      // Update WorkerManager authentication if it's ready
      if (this.workerManager.isReady) {
        await this.workerManager.setAuthConfig({ tokens: tokenList });
        console.log('🔐 Updated WorkerManager authentication with', tokenList.length, 'tokens');
      }
    });

    // Smart initialization - initialize WorkerManager and then load branches
    (async () => {
      try {
        // Initialize the WorkerManager first
        await this.workerManager.initialize();
        
        // Wait for tokens to be loaded from localStorage before configuring auth
        const loadedTokens = await tokens.waitForInitialization();
        if (loadedTokens.length > 0) {
          await this.workerManager.setAuthConfig({ tokens: loadedTokens });
          console.log('🔐 Configured git authentication for', loadedTokens.length, 'hosts');
        } else {
          console.log('🔐 No authentication tokens found');
        }
        
        // Delegate initialization and commit loading to a single method
        await this.#loadCommitsFromRepo();
        
        // Ensure background merge analysis runs once worker is ready
        if (this.patches.length > 0) {
          await this.#performMergeAnalysis(this.patches);
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

    tokens.subscribe(async (tokens) => {
      this.tokens = tokens;
      
      // Update authentication configuration when tokens change
      if (this.workerManager.isReady && tokens.length > 0) {
        try {
          await this.workerManager.setAuthConfig({ tokens });
          console.log('Updated git authentication for', tokens.length, 'hosts');
        } catch (error) {
          console.error('Failed to update git authentication:', error);
        }
      }
    });
  }

  /**
   * Get cached resolved default branch or perform resolution and cache the result
   * This eliminates redundant fallback iterations across multiple git operations
   */
  async getResolvedDefaultBranch(requestedBranch?: string): Promise<string> {
    const now = Date.now();
    
    // Check if we have a valid cached result
    if (this.#resolvedDefaultBranch && 
        (now - this.#branchResolutionTimestamp) < this.#branchResolutionTTL) {
      console.log(`Using cached resolved branch: ${this.#resolvedDefaultBranch}`);
      return this.#resolvedDefaultBranch;
    }
    
    // Perform fresh branch resolution
    console.log('Resolving default branch (cache miss or expired)');
    
    // Use BranchManager's robust branch resolution
    const resolvedBranch = requestedBranch || this.branchManager.getMainBranch();
    
    // Cache the result
    this.#resolvedDefaultBranch = resolvedBranch;
    this.#branchResolutionTimestamp = now;
    
    console.log(`Cached resolved branch: ${resolvedBranch}`);
    return resolvedBranch;
  }
  
  /**
   * Invalidate the cached resolved branch (call when repository state changes)
   */
  invalidateBranchCache(): void {
    console.log('Invalidating branch resolution cache');
    this.#resolvedDefaultBranch = null;
    this.#branchResolutionTimestamp = 0;
  }

  get #maintainers(): string[] {
    const maintainers = this.repo?.maintainers ?? [];
    const owner = this.repo?.owner ?? "";
    const combined = owner ? [...maintainers, owner] : [...maintainers];
    return Array.from(new Set(combined.filter((v): v is string => !!v && v.length > 0)));
  }

  // Public API for getting merge analysis result (requires patch object for proper validation)
  async getMergeAnalysis(patch: PatchEvent, targetBranch?: string): Promise<MergeAnalysisResult | null> {
    if (!this.repoEvent) return null;
  
    const repoId = this.canonicalKey;
    const fallbackMain = this.branchManager.getMainBranch();
    const branch = (targetBranch ?? this.mainBranch ?? fallbackMain).split("/").pop() || fallbackMain;
    // Use workerRepoId (event id) for worker calls when available
    const workerRepoId = this.repoEvent?.id;
    return await this.patchManager.getMergeAnalysis(patch, branch, repoId, workerRepoId);
  }

  // Check if merge analysis is available for a patch ID
  async hasMergeAnalysis(patchId: string): Promise<boolean> {
    return await this.patchManager.hasMergeAnalysis(patchId);
  }

  // Public API for force refresh merge analysis for a patch
  async refreshMergeAnalysis(patch: PatchEvent, targetBranch?: string): Promise<MergeAnalysisResult | null> {
    if (!this.repoEvent) return null;

    const repoId = this.canonicalKey;
    const fallbackMain = this.branchManager.getMainBranch();
    const branch = (targetBranch ?? this.mainBranch ?? fallbackMain).split("/").pop() || fallbackMain;
    // Use workerRepoId (event id) for worker calls when available
    const workerRepoId = this.repoEvent?.id;
    return await this.patchManager.refreshMergeAnalysis(patch, branch, repoId, workerRepoId);
  }

  // Public API for clearing merge analysis cache
  async clearMergeAnalysisCache(): Promise<void> {
    await this.patchManager.clearCache();
  }

  /**
   * Expose a readable store of merge analyses keyed by patchId for UI subscription
   */
  getPatchAnalysisStore(): Readable<Map<string, MergeAnalysisResult>> {
    return this.patchManager.getAnalysisStore();
  }

  /**
   * Convenience accessor for a single patch's latest analysis in memory
   */
  getPatchAnalysisFor(patchId: string): MergeAnalysisResult | undefined {
    return this.patchManager.getAnalysisFor(patchId);
  }

  setCommitsPerPage(count: number) {
    // Delegate to CommitManager
    this.commitManager.setCommitsPerPage(count);
  }

  async #loadCommitsFromRepo() {
    if (!this.repoEvent) return;

    try {
      const repoId = this.canonicalKey;
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

    // Delegate to CommitManager
    await this.commitManager.loadCommits(
      this.canonicalKey,
      undefined, // branch (will use mainBranch)
      this.mainBranch
    );
  }

  async #loadBranchesFromRepo(repoEvent: RepoAnnouncementEvent) {
    // Process repository state event for NIP-34 references if available
    if (this.repoStateEvent) {
      this.branchManager.processRepoStateEvent(this.repoStateEvent);
    }
    
    // Delegate to BranchManager
    await this.branchManager.loadBranchesFromRepo(repoEvent);
  }

  get repoId() {
    return this.canonicalKey;
  }

  get mainBranch() {
    return this.branchManager.getMainBranch();
  }

  get branches() {
    return this.branchManager.getBranches();
  }

  // Expose clone URLs from the parsed repo announcement
  get cloneUrls(): string[] {
    return this.repo?.clone ?? [];
  }

  // Expose relays from the parsed repo announcement
  get relays(): string[] {
    return this.repo?.relays ?? [];
  }

  // Expose maintainers from the parsed repo announcement
  get maintainers(): string[] {
    return this.repo?.maintainers ?? [];
  }

  // Expose currently loaded commits for UI components
  get commits(): any[] {
    return this.commitManager.getCommits();
  }

  /**
   * Get all repository references (branches and tags) with robust fallback logic
   * This method encapsulates the sophisticated branch/ref handling logic that includes:
   * - NIP-34 reference processing
   * - Fallback to processed branches when NIP-34 refs aren't available
   * - Unified ref structure for both heads and tags
   * - Automatic branch loading with error handling
   * @returns Promise<Array<{name: string; type: "heads" | "tags"; fullRef: string; commitId: string}>>
   */
  async getAllRefsWithFallback(): Promise<Array<{name: string; type: "heads" | "tags"; fullRef: string; commitId: string}>> {
    // Process repo state event if available and not already processed
    if (this.repoStateEvent && this.repoStateEvent.tags) {
      const hasProcessedState = this.branchManager?.getAllNIP34References().size > 0;
      if (!hasProcessedState) {
        this.branchManager?.processRepoStateEvent(this.repoStateEvent);
      }
    } else if (!this.repoStateEvent) {
      // Load branches from repository if not available and we have a repo event
      if (
        this.branchManager &&
        this.branchManager.getBranches().length === 0 &&
        this.repoEvent
      ) {
        try {
          await this.branchManager.loadBranchesFromRepo(this.repoEvent);
        } catch (error) {
          console.error('Failed to load branches from git repository:', error);
          // Continue with empty branches rather than throwing
        }
      }
    }

    // Get NIP-34 references first (preferred)
    const nip34Refs = this.branchManager?.getAllNIP34References() || new Map();
    const processedBranches = this.branchManager?.getBranches() || [];

    const refs: Array<{name: string; type: "heads" | "tags"; fullRef: string; commitId: string}> = [];

    // Process NIP-34 references first
    for (const [shortName, ref] of nip34Refs) {
      refs.push({
        name: shortName,
        type: ref.type,
        fullRef: ref.fullRef,
        commitId: ref.commitId,
      });
    }

    // Fallback to processed branches if no NIP-34 refs available
    if (refs.length === 0 && processedBranches.length > 0) {
      for (const branch of processedBranches) {
        const refObj = {
          name: branch.name,
          type: "heads" as const,
          fullRef: `refs/heads/${branch.name}`,
          commitId: branch.oid || "",
        };
        refs.push(refObj);
      }
    }

    // Sort refs: heads first, then tags, alphabetically within each type
    return refs.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "heads" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get branch names only (for backward compatibility)
   * @returns Promise<string[]>
   */
  async getBranchNames(): Promise<string[]> {
    const refs = await this.getAllRefsWithFallback();
    return refs.filter(ref => ref.type === "heads").map(ref => ref.name);
  }

  /**
   * Get tag names only
   * @returns Promise<string[]>
   */
  async getTagNames(): Promise<string[]> {
    const refs = await this.getAllRefsWithFallback();
    return refs.filter(ref => ref.type === "tags").map(ref => ref.name);
  }

  get selectedBranch() {
    return this.branchManager.getSelectedBranch();
  }

  setSelectedBranch(branchName: string) {
    this.branchManager.setSelectedBranch(branchName);
  }


  get isLoading() {
    return Object.values(this.#loadingIds).some((id) => id !== null) || this.commitManager.isLoading();
  }

  get totalCommits() {
    return this.commitManager.getTotalCommits();
  }

  get currentPage() {
    return this.commitManager.getCurrentPage();
  }

  get commitsPerPage() {
    return this.commitManager.getCommitsPerPage();
  }

  // Get the current pagination state
  get pagination() {
    return this.commitManager.getPagination();
  }

  get hasMoreCommits() {
    return this.commitManager.getHasMoreCommits();
  }

  async loadMoreCommits() {
    return await this.commitManager.loadMoreCommits();
  }

  async loadPage(page: number) {
    try {
      
      // Use canonical repo ID consistently for worker calls
      const effectiveRepoId = this.repoId;
      
      // Get the actual resolved default branch with fallback
      let effectiveMainBranch: string;
      try {
        effectiveMainBranch = await this.getResolvedDefaultBranch();
      } catch (branchError) {
        console.warn('⚠️ getResolvedDefaultBranch failed, using fallback:', branchError);
        effectiveMainBranch = this.mainBranch || '';
      }
      
      if (!this.repoEvent || !effectiveMainBranch || !effectiveRepoId) {
        const error = "Repository event, main branch, and repository ID are required";
        return { success: false, error };
      }

      // Use the CommitManager's loadPage method which sets the page and calls loadCommits
      const originalLoadCommits = this.commitManager.loadCommits.bind(this.commitManager);
      
      // Temporarily override loadCommits to provide the required parameters
      this.commitManager.loadCommits = async () => {
        return await originalLoadCommits(
          effectiveRepoId!, // Use the effective repository ID
          undefined, // branch (will use mainBranch)
          effectiveMainBranch!
        );
      };
      
      try {
        const result = await this.commitManager.loadPage(page);
        return result;
      } finally {
        // Restore the original method
        this.commitManager.loadCommits = originalLoadCommits;
      }
    } catch (error) {
      console.error('❌ loadPage error:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) } as const;
    }
  }

  async listRepoFiles({ branch, path }: { branch?: string; path?: string }) {
    const targetBranch = branch || this.branchManager.getMainBranch();
    if (!this.repoEvent) {
      return {
        files: [],
        path: path || "/",
        ref: (targetBranch || "").split("/").pop() || "",
        fromCache: false,
      } as const;
    }
    return this.fileManager.listRepoFiles({
      repoEvent: this.repoEvent,
      repoKey: this.canonicalKey,
      branch: targetBranch,
      path: path || "/",
    });
  }

  async getFileContent({ path, branch, commit }: { path: string; branch?: string; commit?: string }) {
    const targetBranch = branch || this.branchManager.getMainBranch();
    if (!this.repoEvent) {
      return {
        content: "",
        path,
        ref: commit || (targetBranch || "").split("/").pop() || "",
        encoding: "utf-8",
        size: 0,
        fromCache: false,
      } as const;
    }
    return this.fileManager.getFileContent({
      repoEvent: this.repoEvent,
      repoKey: this.canonicalKey,
      path,
      branch: targetBranch,
      commit,
    });
  }

  async fileExistsAtCommit({ path, branch, commit }: { path: string; branch?: string; commit?: string }) {
    const targetBranch = branch || this.branchManager.getMainBranch();
    if (!this.repoEvent) return false;
    return this.fileManager.fileExistsAtCommit({
      repoEvent: this.repoEvent,
      repoKey: this.canonicalKey,
      path,
      branch: targetBranch,
      commit,
    });
  }

  async getFileHistory({ path, branch, maxCount }: { path: string; branch?: string; maxCount?: number }) {
    const targetBranch = branch || this.branchManager.getMainBranch();
    if (!this.repoEvent) return [];
    return this.fileManager.getFileHistory({
      repoEvent: this.repoEvent,
      repoKey: this.canonicalKey,
      path,
      branch: targetBranch,
      maxCount,
    });
  }

  async getCommitHistory({ branch, depth }: { branch?: string; depth?: number }) {
    const targetBranch = branch || this.branchManager.getMainBranch();
    return await this.workerManager.getCommitHistory({
      repoId: this.canonicalKey,
      branch: targetBranch,
      depth: depth ?? this.commitManager.getCommitsPerPage(),
    });
  }

  /**
   * Reset the repository state and clear all caches
   * Forces fresh data to be loaded from remote and resets local git state
   */
  async reset() {
    console.log('Resetting repository state...');
    
    // Reset managers that have reset methods
    this.commitManager?.reset();
    this.branchManager?.reset();
    
    // Clear caches for managers that have clearCache methods
    try {
      await this.fileManager?.clearCache();
      await this.patchManager?.clearCache();
      await this.mergeAnalysisCacheManager?.clear();
      
      // Clear individual cache types in CacheManager
      if (this.cacheManager) {
        await this.cacheManager.clear('file_content');
        await this.cacheManager.clear('file_listing');
        await this.cacheManager.clear('file_exists');
        await this.cacheManager.clear('file_history');
      }
    } catch (error) {
      console.warn('Error clearing caches during reset:', error);
    }
    
    // Reset branch resolution cache
    this.invalidateBranchCache();
    
    // Reset clone progress
    this.cloneProgress = {
      isCloning: false,
      phase: '',
      progress: 0,
    };
    
    // Reset local git repository to match remote HEAD state
    if (this.repoEvent) {
      try {
        console.log('Resetting local git repository to match remote...');
        const resetResult = await this.workerManager.resetRepoToRemote(
          this.canonicalKey,
          this.mainBranch
        );
        
        if (resetResult.success) {
          console.log(`Git reset successful: ${resetResult.message}`);
        }
      } catch (resetError) {
        console.warn('Git reset to remote failed:', resetError);
        // Continue with cache clearing even if git reset fails
      }
      
      // Force reload branches and other data
      await this.#loadBranchesFromRepo(this.repoEvent);
      
      // Trigger merge analysis refresh if patches exist
      if (this.patches.length > 0) {
        await this.#performMergeAnalysis(this.patches);
      }
    }
    
    console.log('Repository reset complete');
  }

  /**
   * Create repository announcement event data for NIP-34
   * @param repoData Repository creation data
   * @returns Unsigned event object for external signing and publishing
   */
  createRepoAnnouncementEvent(
    repoData: {
      name: string;
      description?: string;
      cloneUrl?: string; // Legacy single URL support
      webUrl?: string; // Legacy single URL support
      clone?: string[]; // NIP-34 multiple clone URLs
      web?: string[]; // NIP-34 multiple web URLs
      defaultBranch?: string;
      maintainers?: string[];
      relays?: string[];
      hashtags?: string[];
      earliestUniqueCommit?: string;
    }
  ): RepoAnnouncementEvent {
    // Use the shared-types utility function
    return createRepoAnnouncementEvent({
      // Ensure we use the existing canonical repository key rather than deriving from name
      repoId: this.canonicalKey,
      name: repoData.name,
      description: repoData.description,
      // Support both legacy single URLs and new array format
      clone: repoData.clone || (repoData.cloneUrl ? [repoData.cloneUrl] : undefined),
      web: repoData.web || (repoData.webUrl ? [repoData.webUrl] : undefined),
      relays: repoData.relays,
      maintainers: repoData.maintainers,
      hashtags: repoData.hashtags,
      earliestUniqueCommit: repoData.earliestUniqueCommit || repoData.defaultBranch,
    });
  }
  
  /**
   * Create repository state event data for NIP-34
   * @param stateData Repository state data
   * @returns Unsigned event object for external signing and publishing
   */
  createRepoStateEvent(
    stateData: {
      repositoryId: string;
      headBranch?: string;
      branches?: string[];
      tags?: string[];
      refs?: Array<{ type: "heads" | "tags", name: string, commit: string, ancestry?: string[] }>;
    }
  ): RepoStateEvent {
    // Use the shared-types utility function
    return createRepoStateEvent({
      repoId: stateData.repositoryId,
      head: stateData.headBranch,
      refs: stateData.refs || [
        // Convert branches to refs format
        ...(stateData.branches?.map(branch => ({
          type: "heads" as const,
          name: branch,
          commit: "HEAD" // This would be the actual commit hash
        })) || []),
        // Convert tags to refs format
        ...(stateData.tags?.map(tag => ({
          type: "tags" as const,
          name: tag,
          commit: "HEAD" // This would be the actual commit hash
        })) || [])
      ]
    });
  }

  dispose() {
    this.cacheManager?.dispose();
    // MergeAnalysisCacheManager doesn't have a dispose method - it's managed by CacheManager
    this.patchManager?.dispose();
    this.commitManager?.dispose();
    this.branchManager?.dispose();
    this.fileManager?.dispose();
    this.workerManager?.dispose();
    console.log('Repo disposed');
  }

  // Perform background merge analysis for patches
  async #performMergeAnalysis(patches: PatchEvent[]) {
    if (!patches?.length) return;
    
    const repoId = this.canonicalKey;
    const targetBranch = this.mainBranch?.split("/").pop() || "";
    const workerRepoId = this.repoEvent?.id;
    
    // Delegate to PatchManager for background processing
    await this.patchManager.processInBackground(patches, targetBranch, repoId, workerRepoId);
  }
}
