import { WorkerManager } from "./WorkerManager";
import { CacheManager, CacheType } from "./CacheManager";
import { context } from "$lib/stores/context";

/**
 * Configuration options for CommitManager
 */
export interface CommitManagerConfig {
  /** Default commits per page */
  defaultCommitsPerPage?: number;
  /** Maximum commits per page */
  maxCommitsPerPage?: number;
  /** Default depth for commit history */
  defaultDepth?: number;
  /** Enable caching of commit data */
  enableCaching?: boolean;
}

/**
 * Pagination state for commit history
 */
export interface CommitPagination {
  page: number;
  pageSize: number;
  total?: number;
  hasMore: boolean;
  loading: boolean;
}

/**
 * Result of commit loading operations
 */
export interface CommitLoadResult {
  success: boolean;
  commits?: any[];
  totalCount?: number;
  error?: string;
  fromCache?: boolean;
}

/**
 * CommitManager handles all commit-related operations including history loading,
 * pagination, caching, and coordination with the git worker system.
 * 
 * This component is part of the composition-based refactor of the Repo class,
 * extracting commit-specific functionality into a focused, reusable component.
 */
export class CommitManager {
  private workerManager: WorkerManager;
  private cacheManager?: CacheManager;
  private config: Required<CommitManagerConfig>;
  // Repo identifiers
  private canonicalKey?: string; // for caches and internal maps
  private workerRepoId?: string; // for worker API calls
  // Cache
  private readonly COMMIT_CACHE_NAME = "commit_history";
  
  // Commit state
  private commits: any[] = [];
  private totalCommits?: number;
  private currentPage: number = 1;
  private commitsPerPage: number;
  private hasMoreCommits: boolean = false;
  
  // Loading state
  private loadingIds: {
    commits: string | null;
    branches: string | null;
  } = {
    commits: null,
    branches: null,
  };

  constructor(
    workerManager: WorkerManager,
    cacheManager?: CacheManager,
    config: CommitManagerConfig = {}
  ) {
    this.workerManager = workerManager;
    this.cacheManager = cacheManager;
    
    // Set default configuration
    this.config = {
      defaultCommitsPerPage: config.defaultCommitsPerPage ?? 30,
      maxCommitsPerPage: config.maxCommitsPerPage ?? 100,
      defaultDepth: config.defaultDepth ?? 100,
      enableCaching: config.enableCaching ?? true,
    };
    
    this.commitsPerPage = this.config.defaultCommitsPerPage;

    // Register commit cache if available
    if (this.cacheManager) {
      this.cacheManager.registerCache(this.COMMIT_CACHE_NAME, {
        type: CacheType.LOCAL_STORAGE,
        keyPrefix: 'commit_history_cache_',
        defaultTTL: 15 * 60 * 1000,
        autoCleanup: true,
        cleanupInterval: 5 * 60 * 1000,
      });
    }
  }

  /**
   * Set the current repository identifiers
   */
  setRepoKeys(keys: { canonicalKey?: string; workerRepoId?: string }) {
    if (keys.canonicalKey) this.canonicalKey = keys.canonicalKey;
    if (keys.workerRepoId) this.workerRepoId = keys.workerRepoId;
  }

  /**
   * Get current commits
   */
  getCommits(): any[] {
    return this.commits;
  }

  /**
   * Get total commit count
   */
  getTotalCommits(): number | undefined {
    return this.totalCommits;
  }

  /**
   * Get current page number
   */
  getCurrentPage(): number {
    return this.currentPage;
  }

  /**
   * Get commits per page
   */
  getCommitsPerPage(): number {
    return this.commitsPerPage;
  }

  /**
   * Check if there are more commits to load
   */
  getHasMoreCommits(): boolean {
    return this.hasMoreCommits;
  }

  /**
   * Get current pagination state
   */
  getPagination(): CommitPagination {
    return {
      page: this.currentPage,
      pageSize: this.commitsPerPage,
      total: this.totalCommits,
      hasMore: this.hasMoreCommits,
      loading: this.loadingIds.commits !== null,
    };
  }

  /**
   * Check if commits are currently loading
   */
  isLoading(): boolean {
    return this.loadingIds.commits !== null;
  }

  /**
   * Set commits per page (with validation)
   */
  setCommitsPerPage(count: number): void {
    if (count > 0 && count <= this.config.maxCommitsPerPage) {
      this.commitsPerPage = count;
      // Reset pagination when page size changes
      this.currentPage = 1;
      this.commits = [];
      this.totalCommits = undefined;
      this.hasMoreCommits = false;
    }
  }

  /**
   * Load commits for a specific page
   */
  async loadPage(page: number): Promise<CommitLoadResult> {
    this.currentPage = page;
    return await this.loadCommits();
  }

  /**
   * Load more commits (next page)
   */
  async loadMoreCommits(): Promise<CommitLoadResult> {
    if (this.hasMoreCommits && !this.isLoading()) {
      this.currentPage++;
      return await this.loadCommits();
    }
    return { success: false, error: "No more commits to load or already loading" };
  }

  /**
   * Refresh commits (reload current page)
   */
  async refreshCommits(): Promise<CommitLoadResult> {
    // Clear cache if enabled
    if (this.config.enableCaching && this.cacheManager) {
      // Clear commit history cache to force fresh load
      await this.cacheManager.clear(this.COMMIT_CACHE_NAME);
    }
    
    return await this.loadCommits();
  }

  /**
   * Load commit history for a repository and branch
   */
  async loadCommits(
    repoId?: string,
    branch?: string,
    mainBranch?: string
  ): Promise<CommitLoadResult> {
    const effectiveRepoId = repoId || this.workerRepoId;
    if (!effectiveRepoId || !mainBranch) {
      return { success: false, error: "Repository ID and main branch are required" };
    }

    try {
      // Clear any previous error
      if (this.loadingIds.commits) {
        context.remove(this.loadingIds.commits);
      }

      this.loadingIds.commits = context.loading("Loading commits...");

    // Try cache first if enabled
    const cacheEnabled = !!(this.config.enableCaching && this.cacheManager && this.canonicalKey);
    const branchName = (branch || mainBranch).split("/").pop();
    const pageKey = cacheEnabled
      ? `${this.canonicalKey}:${branchName}:p${this.currentPage}:s${this.commitsPerPage}`
      : undefined;
    type CommitPageCacheEntry = {
      commits: any[];
      total?: number;
      page: number;
      pageSize: number;
      branch: string;
      repoKey: string;
    };
    if (cacheEnabled && pageKey) {
      const cached = await this.cacheManager!.get<CommitPageCacheEntry>(this.COMMIT_CACHE_NAME, pageKey);
      if (cached && cached.repoKey === this.canonicalKey && cached.branch === branchName) {
        // Apply cached state
        this.commits = cached.commits;
        this.totalCommits = cached.total;
        this.hasMoreCommits = cached.total
          ? this.currentPage * this.commitsPerPage < cached.total
          : cached.commits.length === this.commitsPerPage; // heuristic if no total

        if (this.loadingIds.commits) {
          context.remove(this.loadingIds.commits);
          this.loadingIds.commits = null;
        }
        return {
          success: true,
          commits: this.commits,
          totalCount: this.totalCommits,
          fromCache: true,
        };
      }
    }

      // Calculate the depth needed for current page
      const requiredDepth = this.commitsPerPage * this.currentPage;

      // Check current data level
      const dataLevel = await this.workerManager.getRepoDataLevel(effectiveRepoId);

      // For commit history, we need full clone to avoid NotFoundError
      if (dataLevel !== "full") {
        console.log(`Upgrading to full clone for commit history (current: ${dataLevel})`);
        const upgradeResult = await this.workerManager.ensureFullClone({
          repoId: effectiveRepoId,
          branch: branchName,
          depth: Math.max(requiredDepth, this.config.defaultDepth),
        });

        if (!upgradeResult.success) {
          throw new Error(`Failed to upgrade to full clone: ${upgradeResult.error}`);
        }
      }

      // Load commits with the worker's optimized method
      const commitsResult = await this.workerManager.getCommitHistory({
        repoId: effectiveRepoId,
        branch: branchName,
        depth: requiredDepth,
      });

      if (commitsResult.success) {
        const allCommits = commitsResult.commits || [];
        const startIndex = (this.currentPage - 1) * this.commitsPerPage;
        const endIndex = startIndex + this.commitsPerPage;

        // Extract commits for current page
        const pageCommits = allCommits.slice(startIndex, endIndex);

        // If it's the first page, replace the commits, otherwise append
        this.commits =
          this.currentPage === 1 ? pageCommits : [...this.commits, ...pageCommits];

        this.hasMoreCommits = endIndex < allCommits.length;

        // Only fetch total count on first load and cache it
        if (this.currentPage === 1 && this.totalCommits === undefined) {
          if (allCommits.length < requiredDepth) {
            // If we got fewer commits than requested, we have all of them
            this.totalCommits = allCommits.length;
          } else {
            // Get total count separately (this might be cached)
            const countResult = await this.workerManager.getCommitCount({
              repoId: effectiveRepoId,
              branch: branchName,
            });

            if (countResult.success) {
              this.totalCommits = countResult.count;
            }
          }
        }

        // Update loading message to success
        if (this.loadingIds.commits) {
          const message =
            this.currentPage === 1
              ? `Loaded ${pageCommits.length} commits`
              : `Loaded ${pageCommits.length} more commits`;

          context.update(this.loadingIds.commits, {
            type: "success",
            message,
            duration: 2000,
          });
          this.loadingIds.commits = null;
        }

        return {
          success: true,
          commits: pageCommits,
          totalCount: this.totalCommits,
        };
      } else {
        throw new Error(commitsResult.error);
      }
    } catch (error) {
      console.error("Failed to load commits:", error);

      if (this.loadingIds.commits) {
        context.update(this.loadingIds.commits, {
          type: "error",
          message: "Failed to load commits",
          details: error instanceof Error ? error.message : "Unknown error",
          duration: 5000,
        });
        this.loadingIds.commits = null;
      } else {
        context.error(
          "Failed to load commits",
          error instanceof Error ? error.message : "Unknown error"
        );
      }

      this.commits = [];
      this.hasMoreCommits = false;

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get commit history for a repository and branch (delegated method)
   */
  async getCommitHistory({
    repoId,
    branch,
    depth,
  }: {
    repoId: string;
    branch?: string;
    depth?: number;
  }): Promise<any> {
    return await this.workerManager.getCommitHistory({
      repoId,
      branch,
      depth,
    });
  }

  /**
   * Get file history for a specific file
   */
  async getFileHistory({
    repoEvent,
    path,
    branch,
    maxCount,
  }: {
    repoEvent: any;
    path: string;
    branch?: string;
    maxCount?: number;
  }): Promise<any> {
    return await this.workerManager.getFileHistory({
      repoEvent,
      path,
      branch,
      maxCount,
    });
  }

  /**
   * Reset commit state
   */
  reset(): void {
    this.commits = [];
    this.totalCommits = undefined;
    this.currentPage = 1;
    this.hasMoreCommits = false;
    
    // Clear any loading states
    if (this.loadingIds.commits) {
      context.remove(this.loadingIds.commits);
      this.loadingIds.commits = null;
    }
  }

  /**
   * Get commit statistics (for debugging/monitoring)
   */
  getStats(): {
    totalCommits?: number;
    loadedCommits: number;
    currentPage: number;
    commitsPerPage: number;
    hasMore: boolean;
    isLoading: boolean;
  } {
    return {
      totalCommits: this.totalCommits,
      loadedCommits: this.commits.length,
      currentPage: this.currentPage,
      commitsPerPage: this.commitsPerPage,
      hasMore: this.hasMoreCommits,
      isLoading: this.isLoading(),
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CommitManagerConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Apply immediate changes
    if (config.defaultCommitsPerPage && config.defaultCommitsPerPage !== this.commitsPerPage) {
      this.setCommitsPerPage(config.defaultCommitsPerPage);
    }
    
    console.log('CommitManager configuration updated:', this.config);
  }

  /**
   * Dispose of the commit manager
   */
  dispose(): void {
    // Clear loading states
    if (this.loadingIds.commits) {
      context.remove(this.loadingIds.commits);
    }
    if (this.loadingIds.branches) {
      context.remove(this.loadingIds.branches);
    }
    
    // Reset state
    this.reset();
    
    console.log('CommitManager disposed');
  }
}
