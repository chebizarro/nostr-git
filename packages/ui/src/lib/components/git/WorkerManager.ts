import { getGitWorker } from "@nostr-git/git-worker";
import type { EventIO } from "@nostr-git/shared-types";
import {
  listBranchesFromEvent,
  listRepoFilesFromEvent,
  getRepoFileContentFromEvent,
  fileExistsAtCommit,
  getCommitInfo,
  getFileHistory,
  getCommitHistory,
} from "@nostr-git/core";
import { RepoAnnouncementEvent } from "@nostr-git/shared-types";

export interface WorkerProgressEvent {
  repoId: string;
  phase: string;
  progress?: number;
  patchId?: string;
  targetBranch?: string;
  message?: string;
}

export interface WorkerProgressCallback {
  (event: WorkerProgressEvent): void;
}

export interface CloneProgress {
  isCloning: boolean;
  phase: string;
  progress?: number;
}

export interface AuthToken {
  host: string;
  token: string;
}

export interface AuthConfig {
  tokens: AuthToken[];
}

/**
 * WorkerManager handles all git worker communication and lifecycle management.
 * This provides a clean interface for git operations while managing the underlying worker.
 */
export class WorkerManager {
  private worker: Worker | null = null;
  private api: any = null;
  private isInitialized = false;
  private progressCallback?: WorkerProgressCallback;
  private authConfig: AuthConfig = { tokens: [] };
  // Throttle repeated initialize() calls and avoid duplicate work
  private initInFlight: Promise<void> | null = null;
  private lastInitAt = 0;
  private static readonly MIN_INIT_INTERVAL_MS = 1500;
  // Deduplicate auth-config updates
  private lastAuthConfigJson = "";
  constructor(progressCallback?: WorkerProgressCallback) {
    this.progressCallback = progressCallback;
    // Clean architecture - worker handles EventIO internally
  }

  /**
   * Initialize the git worker and API
   */
  async initialize() {
    if (this.initInFlight) {
      return this.initInFlight;
    }
    if (this.isInitialized) {
      return;
    }
    this.initInFlight = (async () => {
      const { worker, api } = getGitWorker(this.handleWorkerProgress);
      this.worker = worker;
      this.api = api as any;
      this.isInitialized = true;
      
      try {
        if (this.worker) {
          // Comlink proxies do not enumerate properties reliably; avoid Object.keys checks
        }

        // Set authentication configuration in the worker (dedup)
        const cfgJson = JSON.stringify(this.authConfig || {});
        if (cfgJson !== this.lastAuthConfigJson) {
          if (this.authConfig.tokens.length > 0 && this.api && typeof (this.api as any).setAuthConfig === 'function') {
            await (this.api as any).setAuthConfig(this.authConfig);
          }
          this.lastAuthConfigJson = cfgJson;
        }
      } catch (error) {
        console.error("Failed to initialize git worker:", error);
        throw new Error(
          `Worker initialization failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      this.lastInitAt = Date.now();
    })();

    try {
      await this.initInFlight;
    } finally {
      this.initInFlight = null;
    }
  }
  async execute<T>(operation: string, params: any): Promise<T> {
    if (!this.isInitialized || !this.api) {
      throw new Error("WorkerManager not initialized. Call initialize() first.");
    }
    try {
      let safeParams = params;
      try {
        safeParams = JSON.parse(JSON.stringify(params));
      } catch {
        /* fall back to original */
      }

      const method = (this.api as any)[operation];

      if (typeof method !== 'function') {
        console.warn(`[WorkerManager] Requested operation '${operation}' not found in worker API`);
        throw new Error(`Operation '${operation}' is not supported by current worker.`);
      }

      // Check if params are actually serializable
      try {
        const serialized = JSON.stringify(safeParams, null, 2);
      } catch (serError) {
        console.error('[WorkerManager] Params NOT serializable!', serError);
        throw new Error(`Cannot serialize params for ${operation}: ${serError}`);
      }
      
      // Check if method is actually a function
      
      // Add timeout to detect hanging worker calls
      const timeoutMs = operation === 'analyzePatchMerge' ? 90000 : 30000;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Worker operation '${operation}' timed out after ${timeoutMs}ms`)), timeoutMs);
      });
      const resultPromise = method(safeParams);
      const result = await Promise.race([resultPromise, timeoutPromise]);
      try {
        return JSON.parse(JSON.stringify(result)) as T;
      } catch {
        return result as T;
      }
    } catch (error) {
      console.error('[WorkerManager] execute error:', error);
      const msg = error instanceof Error ? error.message : String(error);
      if (msg && msg.includes("Proxy object could not be cloned")) {
        throw new Error(`Worker returned a non-transferable value for '${operation}'.`);
      }
      throw error;
    }
  }

  /**
   * Smart repository initialization
   */
  async smartInitializeRepo(params: {
    repoId: string;
    cloneUrls: string[];
    branch?: string;
    forceUpdate?: boolean;
  }): Promise<any> {
    return this.execute("smartInitializeRepo", params);
  }

  /**
   * Sync local repository with remote HEAD
   * Ensures the local repo always points to the latest remote HEAD
   */
  async syncWithRemote(params: {
    repoId: string;
    cloneUrls: string[];
    branch?: string;
  }): Promise<any> {
    return this.execute("syncWithRemote", params);
  }

  /**
   * Push local repository to a remote
   */
  async pushToRemote(params: {
    repoId: string;
    remoteUrl: string;
    branch?: string;
    token?: string;
    provider?: string;
  }): Promise<any> {
    return this.execute("pushToRemote", params);
  }

  /**
   * Safe push with preflight checks and optional destructive-action confirmation
   */
  async safePushToRemote(params: {
    repoId: string;
    remoteUrl: string;
    branch?: string;
    token?: string;
    provider?: string;
    allowForce?: boolean;
    confirmDestructive?: boolean;
    preflight?: {
      blockIfUncommitted?: boolean;
      requireUpToDate?: boolean;
      blockIfShallow?: boolean;
    };
  }): Promise<any> {
    return this.execute("safePushToRemote", params);
  }

  /**
   * Get repository data level (refs, shallow, full)
   */
  async getRepoDataLevel(repoId: string): Promise<string> {
    return this.execute("getRepoDataLevel", repoId);
  }

  /**
   * Ensure full clone of repository
   */
  async ensureFullClone(params: { repoId: string; branch: string; depth?: number }): Promise<any> {
    return this.execute("ensureFullClone", params);
  }

  /**
   * Get commit history
   */
  async getCommitHistory(params: {
    repoId: string;
    branch: string;
    depth: number;
    offset?: number;
  }): Promise<any> {
    return this.execute("getCommitHistory", params);
  }

  /**
   * Get detailed information about a specific commit including metadata and file changes
   */
  async getCommitDetails(params: {
    repoId: string;
    commitId: string;
    branch?: string;
  }): Promise<any> {
    return this.execute("getCommitDetails", params);
  }

  /**
   * Get commit count
   */
  async getCommitCount(params: { repoId: string; branch: string }): Promise<any> {
    return this.execute("getCommitCount", params);
  }

  /**
   * Get working tree status using worker's getStatus()
   */
  async getStatus(params: { repoId: string; branch?: string }): Promise<any> {
    return this.execute("getStatus", params);
  }

  /**
   * Delete repository
   */
  async deleteRepo(params: { repoId: string }): Promise<any> {
    return this.execute("deleteRepo", params);
  }

  /**
   * Analyze patch merge
   */
  async analyzePatchMerge(params: {
    repoId: string;
    patchData: any;
    targetBranch: string;
  }): Promise<any> {
    return this.execute("analyzePatchMerge", params);
  }

  /**
   * List branches from repository event
   */
  async listBranchesFromEvent(params: { repoEvent: RepoAnnouncementEvent }): Promise<any> {
    /**
     * WARNING: This is a thin helper that returns raw local git branch names from the
     * UI thread by calling the core function directly. It does NOT interpret NIP-34
     * RepoState refs or HEAD and therefore must not be used to determine a default
     * branch or to render the final branch selector on its own.
     *
     * For authoritative branch handling, including mapping of NIP-34 refs (refs/heads/*, refs/tags/*)
     * and HEAD resolution with multi-fallback defaults, use BranchManager:
     *   packages/nostr-git/packages/ui/src/lib/components/git/BranchManager.ts
     *
     * TODO: When the worker exposes an equivalent RPC, route this through `this.execute('listBranchesFromEvent', ...)`
     * to keep FS/git access confined to the worker for consistency.
     */
    return await listBranchesFromEvent(params);
  }

  /**
   * List repository files
   */
  async listRepoFilesFromEvent(params: {
    repoEvent: RepoAnnouncementEvent;
    branch?: string;
    path?: string;
    repoKey?: string;
  }): Promise<any> {
    return await listRepoFilesFromEvent(params);
  }

  /**
   * Get repository file content
   */
  async getRepoFileContentFromEvent(params: {
    repoEvent: RepoAnnouncementEvent;
    branch?: string;
    path: string;
    commit?: string;
    repoKey?: string;
  }): Promise<any> {
    return await getRepoFileContentFromEvent(params);
  }

  /**
   * List tree at a specific commit (for tag browsing)
   * NOTE: Requires worker API support for listTreeAtCommit.
   */
  async listTreeAtCommit(params: {
    repoEvent: RepoAnnouncementEvent;
    commit: string;
    path?: string;
    repoKey?: string;
  }): Promise<any> {
    if (!this.isInitialized || !this.api) {
      throw new Error("WorkerManager not initialized");
    }
    try {
      if (!this.api || typeof (this.api as any).listTreeAtCommit !== "function") {
        throw new Error("Worker does not support listTreeAtCommit (update worker to enable tag browsing)");
      }
      // Ensure params are structured-cloneable to avoid DataCloneError across Comlink boundary
      let safeParams = params;
      try {
        safeParams = JSON.parse(JSON.stringify(params));
      } catch {
        /* fall back to original */
      }
      // Call through to worker API (must be implemented there)
      const result = await (this.api as any).listTreeAtCommit(safeParams);
      try {
        return JSON.parse(JSON.stringify(result));
      } catch {
        return result;
      }
    } catch (error) {
      console.error("listTreeAtCommit failed:", error);
      throw error;
    }
  }

  /**
   * Check if file exists at commit
   */
  async fileExistsAtCommit(params: {
    repoEvent: RepoAnnouncementEvent;
    branch?: string;
    path: string;
    commit?: string;
    repoKey?: string;
  }): Promise<any> {
    return await fileExistsAtCommit(params);
  }

  /**
   * Get commit information
   */
  async getCommitInfo(params: { repoEvent: RepoAnnouncementEvent; commit: string }): Promise<any> {
    return await getCommitInfo(params);
  }

  /**
   * Get file history
   */
  async getFileHistory(params: {
    repoEvent: RepoAnnouncementEvent;
    path: string;
    branch: string;
    maxCount?: number;
    repoKey?: string;
  }): Promise<any> {
    return await getFileHistory(params);
  }

  /**
   * Get commit history (alternative method using core function)
   */
  async getCommitHistoryFromEvent(params: {
    repoEvent: RepoAnnouncementEvent;
    branch: string;
    depth?: number;
  }): Promise<any> {
    return await getCommitHistory(params);
  }

  /**
   * Apply a patch and push to remotes
   */
  async applyPatchAndPush(params: {
    repoId: string;
    patchData: any;
    targetBranch?: string;
    mergeCommitMessage?: string;
    authorName?: string;
    authorEmail?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    mergeCommitOid?: string;
    pushedRemotes?: string[];
    skippedRemotes?: string[];
    warning?: string;
    pushErrors?: Array<{ remote: string; url: string; error: string; code: string; stack: string }>;
  }> {
    await this.initialize();

    const result = await this.api.applyPatchAndPush(params);
    return result;
  }

  /**
   * Check if worker is ready for operations
   */
  get isReady(): boolean {
    return this.isInitialized && this.worker !== null && this.api !== null;
  }

  /**
   * Get the underlying worker instance (for advanced use cases)
   */
  get workerInstance(): Worker | null {
    return this.worker;
  }

  /**
   * Get the API instance (for direct access if needed)
   */
  get apiInstance(): any {
    return this.api;
  }

  /**
   * Set authentication configuration for git operations
   */
  async setAuthConfig(config: AuthConfig): Promise<void> {
    this.authConfig = config;

    // If worker is already initialized, update the configuration
    if (this.isInitialized && this.api) {
      try {
        const nextJson = JSON.stringify(config || {});
        if (nextJson !== this.lastAuthConfigJson) {
          await this.api.setAuthConfig(config);
          this.lastAuthConfigJson = nextJson;
        } // else no-op
      } catch (error) {
        console.error("Failed to update authentication configuration:", error);
      }
    }
  }

  /**
   * Add or update a single authentication token
   */
  async addAuthToken(token: AuthToken): Promise<void> {
    // Remove existing token for the same host
    this.authConfig.tokens = this.authConfig.tokens.filter((t) => t.host !== token.host);
    // Add the new token
    this.authConfig.tokens.push(token);

    // Update the worker if initialized
    if (this.isInitialized && this.api) {
      await this.setAuthConfig(this.authConfig);
    }
  }

  /**
   * Remove authentication token for a specific host
   */
  async removeAuthToken(host: string): Promise<void> {
    this.authConfig.tokens = this.authConfig.tokens.filter((t) => t.host !== host);

    // Update the worker if initialized
    if (this.isInitialized && this.api) {
      await this.setAuthConfig(this.authConfig);
    }
  }

  /**
   * Get current authentication configuration
   */
  getAuthConfig(): AuthConfig {
    return { ...this.authConfig };
  }

  /**
   * Reset repository to match remote HEAD state
   * This performs a hard reset to remove any local commits that diverge from remote
   */
  async resetRepoToRemote(repoId: string, branch?: string): Promise<any> {
    if (!this.isInitialized || !this.api) {
      throw new Error("WorkerManager not initialized");
    }

    try {
      const result = await this.api.resetRepoToRemote({ repoId, branch });

      if (!result.success) {
        throw new Error(result.error || "Reset to remote failed");
      }

      console.log(`Repository ${repoId} reset to remote commit ${result.remoteCommit}`);
      return result;
    } catch (error) {
      console.error(`WorkerManager: Reset to remote failed for ${repoId}:`, error);
      throw error;
    }
  }

  /**
   * Update the progress callback
   */
  setProgressCallback(callback: WorkerProgressCallback): void {
    this.progressCallback = callback;
  }

  private handleWorkerProgress = (event: WorkerProgressEvent | MessageEvent): void => {
    const payload = event instanceof MessageEvent ? event.data : event;
    if (!payload || typeof payload !== 'object') {
      return;
    }
    if ('type' in payload && payload.type !== 'clone-progress' && payload.type !== 'merge-progress') {
      return;
    }

    if (!this.progressCallback) {
      return;
    }

    this.progressCallback({
      repoId: (payload as any).repoId,
      phase: (payload as any).phase ?? (payload as any).step ?? 'unknown',
      progress: typeof payload.progress === 'number' ? payload.progress : undefined,
      patchId: (payload as any).patchId,
      targetBranch: (payload as any).targetBranch,
      message: (payload as any).message,
    });
  };

  /**
   * Terminate the worker and clean up resources
   */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.api = null;
    this.isInitialized = false;
    this.progressCallback = undefined;
  }

  /**
   * Check if the worker is still alive and responsive
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isReady) {
      return false;
    }

    try {
      // Try a simple operation to verify worker is responsive
      await this.execute("ping", {});
      return true;
    } catch (error) {
      console.warn("Worker health check failed:", error);
      return false;
    }
  }

  /**
   * Restart the worker if it becomes unresponsive
   */
  async restart(): Promise<void> {
    this.dispose();
    await this.initialize();
  }
}
