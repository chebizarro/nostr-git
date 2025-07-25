import { getGitWorker } from "@nostr-git/core";
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
}

export interface WorkerProgressCallback {
  (event: WorkerProgressEvent): void;
}

export interface CloneProgress {
  isCloning: boolean;
  phase: string;
  progress?: number;
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
  
  constructor(progressCallback?: WorkerProgressCallback) {
    this.progressCallback = progressCallback;
  }

  /**
   * Initialize the git worker and API
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const { api, worker } = getGitWorker(this.progressCallback);
      this.worker = worker;
      this.api = api;
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize git worker:', error);
      throw new Error(`Worker initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute a git operation through the worker API
   */
  async execute<T>(operation: string, params: any): Promise<T> {
    if (!this.isInitialized || !this.api) {
      throw new Error('WorkerManager not initialized. Call initialize() first.');
    }

    try {
      const result = await this.api[operation](params);
      return result;
    } catch (error) {
      console.error(`Git operation '${operation}' failed:`, error);
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
    return this.execute('smartInitializeRepo', params);
  }

  /**
   * Get repository data level (refs, shallow, full)
   */
  async getRepoDataLevel(repoId: string): Promise<string> {
    return this.execute('getRepoDataLevel', repoId);
  }

  /**
   * Ensure full clone of repository
   */
  async ensureFullClone(params: {
    repoId: string;
    branch: string;
    depth?: number;
  }): Promise<any> {
    return this.execute('ensureFullClone', params);
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
    return this.execute('getCommitHistory', params);
  }

  /**
   * Get commit count
   */
  async getCommitCount(params: {
    repoId: string;
    branch: string;
  }): Promise<any> {
    return this.execute('getCommitCount', params);
  }

  /**
   * Delete repository
   */
  async deleteRepo(params: { repoId: string }): Promise<any> {
    return this.execute('deleteRepo', params);
  }

  /**
   * Analyze patch merge
   */
  async analyzePatchMerge(params: {
    repoId: string;
    patchData: any;
    targetBranch: string;
  }): Promise<any> {
    return this.execute('analyzePatchMerge', params);
  }

  /**
   * List branches from repository event
   */
  async listBranchesFromEvent(params: { repoEvent: RepoAnnouncementEvent }): Promise<any> {
    return await listBranchesFromEvent(params);
  }

  /**
   * List repository files
   */
  async listRepoFilesFromEvent(params: {
    repoEvent: RepoAnnouncementEvent;
    branch: string;
    path?: string;
  }): Promise<any> {
    return await listRepoFilesFromEvent(params);
  }

  /**
   * Get repository file content
   */
  async getRepoFileContentFromEvent(params: {
    repoEvent: RepoAnnouncementEvent;
    branch: string;
    path: string;
    commit?: string;
  }): Promise<any> {
    return await getRepoFileContentFromEvent(params);
  }

  /**
   * Check if file exists at commit
   */
  async fileExistsAtCommit(params: {
    repoEvent: RepoAnnouncementEvent;
    branch: string;
    path: string;
    commit?: string;
  }): Promise<any> {
    return await fileExistsAtCommit(params);
  }

  /**
   * Get commit information
   */
  async getCommitInfo(params: {
    repoEvent: RepoAnnouncementEvent;
    commit: string;
  }): Promise<any> {
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
   * Update the progress callback
   */
  setProgressCallback(callback: WorkerProgressCallback): void {
    this.progressCallback = callback;
  }

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
      await this.execute('ping', {});
      return true;
    } catch (error) {
      console.warn('Worker health check failed:', error);
      return false;
    }
  }

  /**
   * Restart the worker if it becomes unresponsive
   */
  async restart(): Promise<void> {
    console.log('Restarting git worker...');
    this.dispose();
    await this.initialize();
  }
}
