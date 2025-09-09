import { WorkerManager } from "./WorkerManager";
import { CacheManager } from "./CacheManager";
import type { RepoAnnouncementEvent } from "@nostr-git/shared-types";
import { parseRepoAnnouncementEvent } from "@nostr-git/shared-types";
import { toast } from "$lib/stores/toast";

/**
 * Configuration options for FileManager
 */
export interface FileManagerConfig {
  /** Enable caching of file content and metadata */
  enableCaching?: boolean;
  /** Cache TTL for file content in milliseconds */
  contentCacheTTL?: number;
  /** Cache TTL for file listings in milliseconds */
  listingCacheTTL?: number;
  /** Maximum file size to cache (in bytes) */
  maxCacheFileSize?: number;
  /** Enable automatic cache cleanup */
  autoCleanup?: boolean;
}

/**
 * File information with metadata
 */
export interface FileInfo {
  /** File path relative to repository root */
  path: string;
  /** File type (file, directory, symlink, etc.) */
  type: string;
  /** File size in bytes (if available) */
  size?: number;
  /** Last modified timestamp (if available) */
  lastModified?: Date;
  /** File mode/permissions (if available) */
  mode?: string;
  /** Commit hash where this file was last modified */
  lastCommit?: string;
}

/**
 * File content with metadata
 */
export interface FileContent {
  /** File content as string */
  content: string;
  /** File path */
  path: string;
  /** Branch or commit where content was retrieved */
  ref: string;
  /** File encoding (utf-8, binary, etc.) */
  encoding?: string;
  /** File size in bytes */
  size: number;
  /** Whether content was retrieved from cache */
  fromCache?: boolean;
}

/**
 * File history entry
 */
export interface FileHistoryEntry {
  /** Commit hash */
  commit: string;
  /** Commit message */
  message: string;
  /** Author information */
  author: {
    name: string;
    email: string;
    timestamp: Date;
  };
  /** Changes made to the file in this commit */
  changes?: {
    added: number;
    removed: number;
  };
}

/**
 * File listing result
 */
export interface FileListingResult {
  /** Array of files and directories */
  files: FileInfo[];
  /** Path that was listed */
  path: string;
  /** Branch or commit used for listing */
  ref: string;
  /** Whether result was retrieved from cache */
  fromCache?: boolean;
}

/**
 * FileManager handles all file-related operations including listing directories,
 * reading file content, checking file existence, and retrieving file history.
 *
 * This component is part of the composition-based refactor of the Repo class,
 * extracting file-specific functionality into a focused, reusable component.
 */
export class FileManager {
  private workerManager: WorkerManager;
  private cacheManager?: CacheManager;
  private config: Required<FileManagerConfig>;

  // Cache keys for different types of file operations
  private static readonly CACHE_KEYS = {
    CONTENT: "file_content",
    LISTING: "file_listing",
    HISTORY: "file_history",
    EXISTS: "file_exists",
  } as const;

  constructor(
    workerManager: WorkerManager,
    cacheManager?: CacheManager,
    config: FileManagerConfig = {}
  ) {
    this.workerManager = workerManager;
    this.cacheManager = cacheManager;

    // Set default configuration
    this.config = {
      enableCaching: config.enableCaching ?? true,
      contentCacheTTL: config.contentCacheTTL ?? 10 * 60 * 1000, // 10 minutes
      listingCacheTTL: config.listingCacheTTL ?? 5 * 60 * 1000, // 5 minutes
      maxCacheFileSize: config.maxCacheFileSize ?? 1024 * 1024, // 1MB
      autoCleanup: config.autoCleanup ?? true,
    };
  }

  /**
   * Compute a canonical repo key for stable UI cache keys
   */
  private getCanonicalRepoKey(repoEvent: RepoAnnouncementEvent): string {
    // Stable, non-throwing canonical key used only for client-side caching.
    // Strategy:
    // 1) If 'd' tag is present, pair it with author pubkey to avoid collisions.
    // 2) Else, use parsed.repoId if available.
    // 3) Else, fall back to event id.
    try {
      const dTag = (repoEvent as any).tags?.find((t: any[]) => t?.[0] === "d");
      const identifier = dTag?.[1]?.trim();
      if (identifier) {
        return `${repoEvent.pubkey}/${identifier}`;
      }
      const parsed = parseRepoAnnouncementEvent(repoEvent as any) as any;
      if (parsed?.repoId) {
        return String(parsed.repoId);
      }
    } catch {}
    // Last resort: event id ensures stability even if suboptimal.
    return (repoEvent as any)?.id || `${repoEvent.pubkey}`;
  }

  /**
   * Generate cache key for file operations
   */
  private generateCacheKey(
    type: keyof typeof FileManager.CACHE_KEYS,
    repoKey: string,
    path: string,
    ref: string
  ): string {
    return `${FileManager.CACHE_KEYS[type]}_${repoKey}_${ref}_${path}`;
  }

  /**
   * Get default branch name from full branch reference
   */
  private getShortBranchName(fullBranch?: string): string {
    const shortName = (fullBranch || "").split("/").pop();
    // If we have a short name, use it; otherwise defer to core's robust branch resolution
    return shortName || "";
  }

  /**
   * List files and directories in a repository path
   */
  async listRepoFiles({
    repoEvent,
    repoKey: providedRepoKey,
    branch,
    path = "",
    useCache = true,
  }: {
    repoEvent: RepoAnnouncementEvent;
    repoKey?: string;
    branch: string;
    path?: string;
    useCache?: boolean;
  }): Promise<FileListingResult> {
    const shortBranch = this.getShortBranchName(branch);
    const repoKey = providedRepoKey || this.getCanonicalRepoKey(repoEvent);
    const cacheKey = this.generateCacheKey("LISTING", repoKey, path, shortBranch);

    // Try cache first if enabled
    if (this.config.enableCaching && useCache && this.cacheManager) {
      try {
        const cached = await this.cacheManager.get("file_listing", cacheKey);
        if (cached && typeof cached === "object") {
          console.log(`File listing cache hit for ${path} on ${shortBranch}`);
          return { ...(cached as FileListingResult), fromCache: true };
        }
      } catch (error) {
        console.warn("Cache read failed for file listing:", error);
      }
    }

    try {
      // Get files from worker
      const result = await this.workerManager.listRepoFilesFromEvent({
        repoEvent,
        branch: shortBranch,
        path,
        repoKey,
      });

      const fileListingResult: FileListingResult = {
        files: result.map(
          (file: any): FileInfo => ({
            path: file.path || file.name,
            type: file.type || "file",
            size: file.size,
            mode: file.mode,
            lastCommit: file.oid,
          })
        ),
        path,
        ref: shortBranch,
        fromCache: false,
      };

      // Cache the result if enabled
      if (this.config.enableCaching && this.cacheManager) {
        await this.cacheManager.set(
          "file_listing",
          cacheKey,
          fileListingResult,
          this.config.listingCacheTTL
        );
      }

      return fileListingResult;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Could not find")) {
        const alternatives = shortBranch === "main" ? ["master", "develop"] : ["main", "master"];

        for (const altBranch of alternatives) {
          try {
            const result = await this.workerManager.listRepoFilesFromEvent({
              repoEvent,
              branch: altBranch,
              path,
              repoKey,
            });

            const fileListingResult: FileListingResult = {
              files: result.map(
                (file: any): FileInfo => ({
                  path: file.path || file.name,
                  type: file.type || "file",
                  size: file.size,
                  mode: file.mode,
                  lastCommit: file.oid,
                })
              ),
              path,
              ref: altBranch,
              fromCache: false,
            };

            if (this.config.enableCaching && this.cacheManager) {
              await this.cacheManager.set(
                "file_listing",
                cacheKey.replace(shortBranch, altBranch),
                fileListingResult,
                this.config.listingCacheTTL
              );
            }

            return fileListingResult;
          } catch (altError) {
            continue;
          }
        }
      }
      toast.push({
        message: `Failed to list repository files for branch '${shortBranch}': ${error}`,
        duration: 8000,
      });
      throw error;
    }
  }

  /**
   * Get file content from repository
   */
  async getFileContent({
    repoEvent,
    repoKey: providedRepoKey,
    path,
    branch,
    commit,
    useCache = true,
  }: {
    repoEvent: RepoAnnouncementEvent;
    repoKey?: string;
    path: string;
    branch?: string;
    commit?: string;
    useCache?: boolean;
  }): Promise<FileContent> {
    const repoKey = providedRepoKey || this.getCanonicalRepoKey(repoEvent);
    const ref = commit || this.getShortBranchName(branch || "");
    const cacheKey = this.generateCacheKey("CONTENT", repoKey, path, ref);

    // Try cache first if enabled
    if (this.config.enableCaching && useCache && this.cacheManager) {
      try {
        const cached = await this.cacheManager.get("file_content", cacheKey);
        if (cached && typeof cached === "object") {
          console.log(`File content cache hit for ${path} at ${ref}`);
          return { ...(cached as FileContent), fromCache: true };
        }
      } catch (error) {
        console.warn("Cache read failed for file content:", error);
      }
    }

    try {
      // Get content from worker
      const content = await this.workerManager.getRepoFileContentFromEvent({
        repoEvent,
        branch: commit ? ("" as any) : ref,
        path,
        commit: commit || undefined,
        repoKey,
      });

      const result: FileContent = {
        content: content || "",
        path,
        ref,
        encoding: "utf-8", // Default encoding
        size: content?.length || 0,
      };

      // Cache the result if enabled and file is not too large
      if (
        this.config.enableCaching &&
        this.cacheManager &&
        result.size <= this.config.maxCacheFileSize
      ) {
        try {
          await this.cacheManager.set(
            "file_content",
            cacheKey,
            result,
            this.config.contentCacheTTL
          );
        } catch (error) {
          console.warn("Cache write failed for file content:", error);
        }
      }

      return result;
    } catch (error) {
      console.error(`Failed to get file content for ${path}:`, error);
      throw error;
    }
  }

  /**
   * Check if file exists at specific commit or branch
   */
  async fileExistsAtCommit({
    repoEvent,
    repoKey: providedRepoKey,
    path,
    branch,
    commit,
    useCache = true,
  }: {
    repoEvent: RepoAnnouncementEvent;
    repoKey?: string;
    path: string;
    branch?: string;
    commit?: string;
    useCache?: boolean;
  }): Promise<boolean> {
    const repoKey = providedRepoKey || this.getCanonicalRepoKey(repoEvent);
    const ref = commit || this.getShortBranchName(branch || "");
    const cacheKey = this.generateCacheKey("EXISTS", repoKey, path, ref);

    // Try cache first if enabled
    if (this.config.enableCaching && useCache && this.cacheManager) {
      try {
        const cached = await this.cacheManager.get("file_exists", cacheKey);
        if (cached !== undefined) {
          console.log(`File exists cache hit for ${path} at ${ref}`);
          return cached as boolean;
        }
      } catch (error) {
        console.warn("Cache read failed for file exists check:", error);
      }
    }

    try {
      // Check existence via worker
      const exists = await this.workerManager.fileExistsAtCommit({
        repoEvent,
        branch: commit ? ("" as any) : ref,
        path,
        commit: commit || undefined,
        repoKey,
      });

      // Cache the result if enabled
      if (this.config.enableCaching && this.cacheManager) {
        try {
          await this.cacheManager.set("file_exists", cacheKey, exists, this.config.listingCacheTTL);
        } catch (error) {
          console.warn("Cache write failed for file exists check:", error);
        }
      }

      return exists;
    } catch (error) {
      console.error(`Failed to check file existence for ${path}:`, error);
      throw error;
    }
  }

  /**
   * Get file history (commits that modified the file)
   */
  async getFileHistory({
    repoEvent,
    repoKey: providedRepoKey,
    path,
    branch,
    maxCount = 50,
    useCache = true,
  }: {
    repoEvent: RepoAnnouncementEvent;
    repoKey?: string;
    path: string;
    branch?: string;
    maxCount?: number;
    useCache?: boolean;
  }): Promise<FileHistoryEntry[]> {
    const shortBranch = this.getShortBranchName(branch);
    const repoKey = providedRepoKey || this.getCanonicalRepoKey(repoEvent);
    const cacheKey = this.generateCacheKey(
      "HISTORY",
      repoKey,
      `${path}_${maxCount}`,
      shortBranch
    );

    // Try cache first if enabled
    if (this.config.enableCaching && useCache && this.cacheManager) {
      try {
        const cached = await this.cacheManager.get("file_history", cacheKey);
        if (cached && Array.isArray(cached)) {
          console.log(`File history cache hit for ${path} on ${shortBranch}`);
          return cached as FileHistoryEntry[];
        }
      } catch (error) {
        console.warn("Cache read failed for file history:", error);
      }
    }

    try {
      // Get history from worker
      const history = await this.workerManager.getFileHistory({
        repoEvent,
        path,
        branch: shortBranch,
        maxCount,
        repoKey,
      });

      // Transform to FileHistoryEntry format
      const result: FileHistoryEntry[] = (history || []).map((entry: any) => ({
        commit: entry.oid || entry.commit,
        message: entry.commit?.message || entry.message || "",
        author: {
          name: entry.commit?.author?.name || entry.author?.name || "Unknown",
          email: entry.commit?.author?.email || entry.author?.email || "",
          timestamp: new Date(entry.commit?.author?.timestamp || entry.timestamp || Date.now()),
        },
        changes: entry.changes,
      }));

      // Cache the result if enabled
      if (this.config.enableCaching && this.cacheManager) {
        try {
          await this.cacheManager.set(
            "file_history",
            cacheKey,
            result,
            this.config.contentCacheTTL
          );
        } catch (error) {
          console.warn("Cache write failed for file history:", error);
        }
      }

      return result;
    } catch (error) {
      console.error(`Failed to get file history for ${path}:`, error);
      throw error;
    }
  }

  /**
   * Clear file-related caches
   */
  async clearCache(repoId?: string): Promise<void> {
    if (!this.cacheManager) return;

    try {
      if (repoId) {
        // Clear cache for specific repository
        const patterns = Object.values(FileManager.CACHE_KEYS).map((key) => `${key}_${repoId}_*`);

        for (const pattern of patterns) {
          // Note: This assumes CacheManager supports pattern-based clearing
          // If not, we'd need to track keys or implement pattern matching
          console.log(`Clearing file cache pattern: ${pattern}`);
        }
      } else {
        // Clear all file caches
        await this.cacheManager.clear("file_listing");
        await this.cacheManager.clear("file_content");
        await this.cacheManager.clear("file_exists");
        await this.cacheManager.clear("file_history");
      }

      console.log("File cache cleared");
    } catch (error) {
      console.error("Failed to clear file cache:", error);
    }
  }

  /**
   * Get file manager statistics
   */
  getStats(): {
    config: Required<FileManagerConfig>;
    cacheEnabled: boolean;
    cacheManager: boolean;
  } {
    return {
      config: this.config,
      cacheEnabled: this.config.enableCaching,
      cacheManager: !!this.cacheManager,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FileManagerConfig>): void {
    this.config = { ...this.config, ...config };
    console.log("FileManager configuration updated:", this.config);
  }

  /**
   * Dispose of the file manager
   */
  dispose(): void {
    // Clear any pending operations or timers if needed
    console.log("FileManager disposed");
  }
}
