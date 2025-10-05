import { WorkerManager } from "./WorkerManager";
import { CacheManager } from "./CacheManager";
import { context } from "$lib/stores/context";
import { toast } from "$lib/stores/toast";
import type { RepoAnnouncementEvent, RepoStateEvent } from "@nostr-git/shared-types";
import { parseRepoAnnouncementEvent } from "@nostr-git/shared-types";

// Branch interface definition (since it's not exported from shared-types)
export interface Branch {
  name: string;
  commit: string;
  oid: string;
  lineage: boolean;
  isHead: boolean;
}

/**
 * Configuration options for BranchManager
 */
export interface BranchManagerConfig {
  /** Enable caching of branch data */
  enableCaching?: boolean;
  /** Cache TTL for branch data in milliseconds */
  cacheTTL?: number;
  /** Enable automatic refresh of branch data */
  autoRefresh?: boolean;
  /** Refresh interval in milliseconds */
  refreshInterval?: number;
}

/**
 * NIP-34 reference information parsed from repository state events
 */
export interface NIP34Reference {
  /** Full NIP-34 reference path (e.g., "refs/heads/main") */
  fullRef: string;
  /** Git-compatible short name (e.g., "main") */
  shortName: string;
  /** Reference type: "heads" for branches, "tags" for tags */
  type: "heads" | "tags";
  /** Commit ID this reference points to */
  commitId: string;
  /** Optional parent commit IDs for tracking commits ahead */
  parentCommits?: string[];
}

/**
 * Processed branch information combining git and NIP-34 data
 */
export interface ProcessedBranch extends Branch {
  /** NIP-34 reference information if available */
  nip34Ref?: NIP34Reference;
  /** Whether this branch comes from NIP-34 state event */
  fromStateEvent?: boolean;
  /** Whether this is the HEAD branch according to NIP-34 */
  isNIP34Head?: boolean;
}

/**
 * BranchManager handles all branch and tag operations, including the critical
 * mapping between NIP-34 reference formats and git-compatible names.
 *
 * NIP-34 uses full reference paths like "refs/heads/main" and "refs/tags/v1.0",
 * while git operations typically expect short names like "main" and "v1.0".
 * This component handles the translation between these formats seamlessly.
 */
export class BranchManager {
  private workerManager: WorkerManager;
  private cacheManager?: CacheManager;
  private config: Required<BranchManagerConfig>;

  // Branch state
  private branches: ProcessedBranch[] = [];
  private selectedBranch?: string;
  private mainBranch?: string;
  private nip34References: Map<string, NIP34Reference> = new Map();
  private refs: Array<{name: string; type: "heads" | "tags"; fullRef: string; commitId: string}> = [];
  private loadingRefs: boolean = false;

  // Loading state
  private loadingIds: {
    branches: string | null;
  } = {
    branches: null,
  };

  // Auto-refresh timer
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(
    workerManager: WorkerManager,
    cacheManager?: CacheManager,
    config: BranchManagerConfig = {}
  ) {
    this.workerManager = workerManager;
    this.cacheManager = cacheManager;

    // Set default configuration
    this.config = {
      enableCaching: config.enableCaching ?? true,
      cacheTTL: config.cacheTTL ?? 5 * 60 * 1000, // 5 minutes
      autoRefresh: config.autoRefresh ?? false,
      refreshInterval: config.refreshInterval ?? 30 * 1000, // 30 seconds
    };
  }

  /**
   * Parse NIP-34 reference string into structured information
   *
   * Examples:
   * - "refs/heads/main" -> { type: "heads", shortName: "main", ... }
   * - "refs/tags/v1.0.0" -> { type: "tags", shortName: "v1.0.0", ... }
   */
  static parseNIP34Reference(refTag: string[], commitId?: string): NIP34Reference | null {
    if (refTag.length < 2) return null;

    const fullRef = refTag[0];
    const refCommitId = refTag[1] || commitId;

    if (!refCommitId) return null;

    // Parse ref path: refs/heads/branch-name or refs/tags/tag-name
    const refMatch = fullRef.match(/^refs\/(heads|tags)\/(.+)$/);
    if (!refMatch) return null;

    const [, type, shortName] = refMatch;

    // Extract parent commits if provided (for tracking commits ahead)
    const parentCommits = refTag.length > 2 ? refTag.slice(2) : undefined;

    return {
      fullRef,
      shortName,
      type: type as "heads" | "tags",
      commitId: refCommitId,
      parentCommits,
    };
  }

  /**
   * Convert git short name to NIP-34 full reference
   */
  static gitNameToNIP34Ref(shortName: string, type: "heads" | "tags" = "heads"): string {
    return `refs/${type}/${shortName}`;
  }

  /**
   * Convert NIP-34 full reference to git short name
   */
  static nip34RefToGitName(fullRef: string): string | null {
    const match = fullRef.match(/^refs\/(heads|tags)\/(.+)$/);
    return match ? match[2] : null;
  }

  /**
   * Parse HEAD reference from NIP-34 format
   * Example: ["HEAD", "ref: refs/heads/main"] -> "main"
   */
  static parseNIP34Head(headTag: string[]): string | null {
    if (headTag.length < 2 || headTag[0] !== "HEAD") return null;

    const headRef = headTag[1];
    const match = headRef.match(/^ref: refs\/heads\/(.+)$/);
    return match ? match[1] : null;
  }

  /**
   * Handle branch resolution errors and surface them through toast system
   */
  private handleBranchNotFound(branchName: string, error: any): void {
    // Only show toast for non-fallback branches (not main/master/develop/dev)
    const fallbackBranches = ["main", "master", "develop", "dev"];
    if (!fallbackBranches.includes(branchName)) {
      const message = `Branch '${branchName}' from repository state not found in local git repository`;
      toast.push({ message, duration: 8000 }); // Show for 8 seconds
      console.warn(`Branch resolution warning: ${message}`, error);
    }
  }

  /**
   * Compute a canonical repo key for worker calls (mirrors FileManager behavior)
   */
  private getCanonicalRepoKey(repoEvent: RepoAnnouncementEvent): string {
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
    return (repoEvent as any)?.id || `${(repoEvent as any)?.pubkey || "unknown"}`;
  }

  /**
   * Process repository state event to extract branch/tag information
   */
  processRepoStateEvent(stateEvent: RepoStateEvent): void {
    this.nip34References.clear();

    if (!stateEvent.tags) return;

    let newMainBranch: string | undefined;

    for (const tag of stateEvent.tags) {
      if (tag[0] === "HEAD") {
        // Parse HEAD reference
        const headBranch = BranchManager.parseNIP34Head(tag);
        if (headBranch) {
          newMainBranch = headBranch;
        }
      } else if (tag[0].startsWith("refs/")) {
        // Parse branch/tag reference
        const ref = BranchManager.parseNIP34Reference(tag);
        if (ref) {
          this.nip34References.set(ref.shortName, ref);
        }
      }
    }

    // Update main branch if found
    if (newMainBranch) {
      this.mainBranch = newMainBranch;
    }

    console.log(`Processed ${this.nip34References.size} NIP-34 references, HEAD: ${newMainBranch}`);
  }

  /**
   * Check if a given branch exists in the actual repo via worker.
   * Uses a lightweight list call; if it errors with not found, we treat as non-existent.
   */
  private async branchExists(repoEvent: RepoAnnouncementEvent, branch: string): Promise<boolean> {
    try {
      const repoKey = this.getCanonicalRepoKey(repoEvent);
      await this.workerManager.listRepoFilesFromEvent({ repoEvent, repoKey, branch, path: "" });
      return true;
    } catch (err: any) {
      const msg = (err && (err.message || String(err))) || "";
      if (typeof msg === "string" && /could not find|not found|unknown ref/i.test(msg)) {
        return false;
      }
      // If error is something else (e.g., transient), don't exclude decisively
      console.warn(`branchExists(${branch}) indeterminate due to error:`, err);
      return true;
    }
  }

  /**
   * Process repository state event but only keep branches that actually exist in the repo.
   * Tags are kept as-is; HEAD is only set if the branch exists.
   */
  async processRepoStateEventVerified(
    stateEvent: RepoStateEvent,
    repoEvent: RepoAnnouncementEvent
  ): Promise<void> {
    this.nip34References.clear();

    if (!stateEvent.tags) return;

    let newMainBranch: string | undefined;

    const fallbackDefaults = new Set(["main", "master", "develop", "dev"]);

    for (const tag of stateEvent.tags) {
      if (tag[0] === "HEAD") {
        const headBranch = BranchManager.parseNIP34Head(tag);
        if (headBranch) {
          // Always honor HEAD; warn if verification fails but don't drop it
          const exists = await this.branchExists(repoEvent, headBranch);
          if (!exists) {
            this.handleBranchNotFound(headBranch, new Error("HEAD branch missing in repo (kept due to HEAD)"));
          }
          newMainBranch = headBranch;
        }
      } else if (tag[0].startsWith("refs/")) {
        const ref = BranchManager.parseNIP34Reference(tag);
        if (ref) {
          if (ref.type === "heads") {
            // Always include common defaults and HEAD branch even if verification fails
            const isDefault = fallbackDefaults.has(ref.shortName);
            const isHead = newMainBranch && ref.shortName === newMainBranch;
            const exists = await this.branchExists(repoEvent, ref.shortName);
            if (exists || isDefault || isHead) {
              this.nip34References.set(ref.shortName, ref);
            } else {
              this.handleBranchNotFound(ref.shortName, new Error("Branch missing in repo"));
            }
          } else {
            // Always include tags
            this.nip34References.set(ref.shortName, ref);
          }
        }
      }
    }

    if (newMainBranch) {
      this.mainBranch = newMainBranch;
    }

    console.log(
      `Verified ${this.nip34References.size} NIP-34 refs (heads filtered by existence), HEAD: ${newMainBranch}`
    );
  }

  /**
   * Get current branches
   */
  getBranches(): ProcessedBranch[] {
    return this.branches;
  }

  /**
   * Get all refs (branches and tags)
   */
  getAllRefs(): Array<{name: string; type: "heads" | "tags"; fullRef: string; commitId: string}> {
    return this.refs;
  }

  /**
   * Check if refs are currently loading
   */
  isLoadingRefs(): boolean {
    return this.loadingRefs;
  }

  /**
   * Get main branch name (git-compatible short name)
   */
  getMainBranch(): string {
    // First try to use the explicitly set main branch
    if (this.mainBranch) {
      return this.mainBranch;
    }

    // Try to find the HEAD branch from repository state
    const headBranch = this.branches.find((b) => b.isHead);
    if (headBranch) {
      return headBranch.name;
    }

    // Fallback to common default branch names in order of preference
    const branchNames = this.branches.map((b) => b.name);
    const commonDefaults = ["main", "master", "develop", "dev"];

    for (const defaultName of commonDefaults) {
      if (branchNames.includes(defaultName)) {
        return defaultName;
      }
    }

    // If we have any branches, use the first one
    if (this.branches.length > 0) {
      return this.branches[0].name;
    }

    // Ultimate fallback
    return "master";
  }

  /**
   * Get selected branch name
   */
  getSelectedBranch(): string | undefined {
    return this.selectedBranch;
  }

  /**
   * Set selected branch
   */
  setSelectedBranch(branchName: string): void {
    this.selectedBranch = branchName;
  }

  /**
   * Get NIP-34 reference for a branch/tag name
   */
  getNIP34Reference(shortName: string): NIP34Reference | undefined {
    return this.nip34References.get(shortName);
  }

  /**
   * Get all NIP-34 references
   */
  getAllNIP34References(): Map<string, NIP34Reference> {
    return new Map(this.nip34References);
  }

  /**
   * Check if branches are currently loading
   */
  isLoading(): boolean {
    return this.loadingIds.branches !== null;
  }

  /**
   * Load all refs (branches and tags) with fallback logic
   * This is the primary method that should be used to load branch/tag data
   */
  async loadAllRefs(
    getAllRefsWithFallback: () => Promise<Array<{name: string; type: "heads" | "tags"; fullRef: string; commitId: string}>>
  ): Promise<void> {
    try {
      this.loadingRefs = true;
      
      // Use the Repo's getAllRefsWithFallback which has proper fallback logic
      const loadedRefs = await getAllRefsWithFallback();
      this.refs = loadedRefs;
      
      // Convert refs to ProcessedBranch format for backward compatibility
      this.branches = loadedRefs
        .filter(ref => ref.type === "heads")
        .map((ref): ProcessedBranch => {
          const nip34Ref = this.nip34References.get(ref.name);
          return {
            name: ref.name,
            commit: ref.commitId,
            oid: ref.commitId,
            lineage: ref.name === this.mainBranch,
            isHead: ref.name === this.mainBranch,
            nip34Ref,
            fromStateEvent: !!nip34Ref,
            isNIP34Head: ref.name === this.mainBranch,
          };
        });
      
      this.loadingRefs = false;
      console.log(`Loaded ${this.refs.length} refs (${this.branches.length} branches, ${this.refs.filter(r => r.type === "tags").length} tags)`);
    } catch (error) {
      console.error("Error loading refs:", error);
      this.refs = [];
      this.branches = [];
      this.loadingRefs = false;
      throw error;
    }
  }

  /**
   * Load branches from repository event (legacy method, prefer loadAllRefs)
   * @deprecated Use loadAllRefs instead
   */
  async loadBranchesFromRepo(repoEvent: RepoAnnouncementEvent): Promise<void> {
    try {
      // Clear any previous loading message
      if (this.loadingIds.branches) {
        context.remove(this.loadingIds.branches);
      }

      this.loadingIds.branches = context.loading("Loading branches...");

      // Get branches from git repository via worker
      const repoBranches = await this.workerManager.listBranchesFromEvent({ repoEvent });

      // Process branches and merge with NIP-34 data
      this.branches = repoBranches.map((branch: Branch): ProcessedBranch => {
        const nip34Ref = this.nip34References.get(branch.name);

        return {
          ...branch,
          nip34Ref,
          fromStateEvent: !!nip34Ref,
          isNIP34Head: branch.name === this.mainBranch,
        };
      });

      // Add any NIP-34 references that don't exist in git branches
      for (const [shortName, ref] of this.nip34References) {
        if (ref.type === "heads" && !this.branches.find((b) => b.name === shortName)) {
          // This is a branch that exists in NIP-34 state but not in git
          // This could happen if the branch was deleted locally but still tracked in state
          this.branches.push({
            name: shortName,
            commit: ref.commitId,
            oid: ref.commitId,
            lineage: shortName === this.mainBranch,
            isHead: shortName === this.mainBranch,
            nip34Ref: ref,
            fromStateEvent: true,
            isNIP34Head: shortName === this.mainBranch,
          });
        }
      }

      // Update loading message to success
      if (this.loadingIds.branches) {
        context.update(this.loadingIds.branches, {
          type: "success",
          message: `Loaded ${this.branches.length} branches`,
          duration: 2000,
        });
        this.loadingIds.branches = null;
      }

      console.log(`Loaded ${this.branches.length} branches with NIP-34 integration`);
    } catch (error) {
      console.error("Error loading branches:", error);

      if (this.loadingIds.branches) {
        context.update(this.loadingIds.branches, {
          type: "error",
          message: "Failed to load branches",
          details: error instanceof Error ? error.message : "Unknown error",
          duration: 5000,
        });
        this.loadingIds.branches = null;
      } else {
        context.error(
          "Failed to load branches",
          error instanceof Error ? error.message : "Unknown error"
        );
      }

      this.branches = [];
    }
  }

  /**
   * Refresh branch data
   */
  async refreshBranches(repoEvent: RepoAnnouncementEvent): Promise<void> {
    await this.loadBranchesFromRepo(repoEvent);
  }

  /**
   * Get branch by name (supports both git short names and NIP-34 full refs)
   */
  getBranch(nameOrRef: string): ProcessedBranch | undefined {
    // Try direct name match first
    let branch = this.branches.find((b) => b.name === nameOrRef);
    if (branch) return branch;

    // Try NIP-34 full ref conversion
    const shortName = BranchManager.nip34RefToGitName(nameOrRef);
    if (shortName) {
      branch = this.branches.find((b) => b.name === shortName);
    }

    return branch;
  }

  /**
   * Get branches filtered by type (heads or tags)
   */
  getBranchesByType(type: "heads" | "tags"): ProcessedBranch[] {
    return this.branches.filter((branch) => {
      if (branch.nip34Ref) {
        return branch.nip34Ref.type === type;
      }
      // For branches without NIP-34 data, assume they are heads
      return type === "heads";
    });
  }

  /**
   * Get only branches (heads)
   */
  getHeads(): ProcessedBranch[] {
    return this.getBranchesByType("heads");
  }

  /**
   * Get only tags
   */
  getTags(): ProcessedBranch[] {
    return this.getBranchesByType("tags");
  }

  /**
   * Start auto-refresh if enabled
   */
  startAutoRefresh(repoEvent: RepoAnnouncementEvent): void {
    if (!this.config.autoRefresh) return;

    this.stopAutoRefresh();

    this.refreshTimer = setInterval(async () => {
      try {
        await this.refreshBranches(repoEvent);
      } catch (error) {
        console.error("Auto-refresh failed:", error);
      }
    }, this.config.refreshInterval);

    console.log(`Started auto-refresh every ${this.config.refreshInterval}ms`);
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
      console.log("Stopped auto-refresh");
    }
  }

  /**
   * Reset branch state
   */
  reset(): void {
    this.branches = [];
    this.selectedBranch = undefined;
    this.mainBranch = undefined;
    this.nip34References.clear();

    // Clear loading states
    if (this.loadingIds.branches) {
      context.remove(this.loadingIds.branches);
      this.loadingIds.branches = null;
    }

    this.stopAutoRefresh();
  }

  /**
   * Get branch statistics (for debugging/monitoring)
   */
  getStats(): {
    totalBranches: number;
    headsCount: number;
    tagsCount: number;
    nip34RefsCount: number;
    mainBranch?: string;
    selectedBranch?: string;
    isLoading: boolean;
  } {
    return {
      totalBranches: this.branches.length,
      headsCount: this.getHeads().length,
      tagsCount: this.getTags().length,
      nip34RefsCount: this.nip34References.size,
      mainBranch: this.mainBranch,
      selectedBranch: this.selectedBranch,
      isLoading: this.isLoading(),
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BranchManagerConfig>): void {
    this.config = { ...this.config, ...config };
    console.log("BranchManager configuration updated:", this.config);
  }

  /**
   * Dispose of the branch manager
   */
  dispose(): void {
    // Clear loading states
    if (this.loadingIds.branches) {
      context.remove(this.loadingIds.branches);
    }

    // Stop auto-refresh
    this.stopAutoRefresh();

    // Reset state
    this.reset();

    console.log("BranchManager disposed");
  }
}
