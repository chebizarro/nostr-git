import { type PatchEvent } from "@nostr-git/shared-types";
import { type MergeAnalysisResult } from "@nostr-git/core";
import { WorkerManager } from "./WorkerManager";
import { MergeAnalysisCacheManager } from "./CacheManager";
import { writable, type Readable } from "svelte/store";

// Summary shape compatible with PatchDagSummary.svelte props
export interface PatchDagSummary {
  nodeCount: number;
  roots: string[];
  rootRevisions: string[];
  edgesCount?: number;
  topParents?: string[];
  parentOutDegree?: Record<string, number>;
  parentChildren?: Record<string, string[]>;
}

export interface LabelsData {
  byId: Map<string, string[]>;
  groupsById: Map<string, Record<string, string[]>>;
  allLabels: string[];
}

export interface StatusData {
  stateById: Record<string, "open" | "draft" | "closed" | "merged" | "resolved" | undefined>;
  reasonById: Record<string, string | undefined>;
}

/**
 * Configuration options for PatchManager
 */
export interface PatchManagerConfig {
  /** Batch size for background processing */
  batchSize?: number;
  /** Delay between batches in milliseconds */
  batchDelay?: number;
  /** Maximum concurrent analysis operations */
  maxConcurrent?: number;
  /** Log level for PatchManager: controls console noise (default: 'warn') */
  logLevel?: "silent" | "error" | "warn" | "info" | "debug";
}

/**
 * PatchManager handles all patch-related operations including merge analysis,
 * background processing, and coordination with cache and worker systems.
 *
 * This component is part of the composition-based refactor of the Repo class,
 * extracting patch-specific functionality into a focused, reusable component.
 */
export class PatchManager {
  private workerManager: WorkerManager;
  private cacheManager: MergeAnalysisCacheManager;
  private config: Required<PatchManagerConfig>;
  // Severity mapping for log filtering
  private static readonly severity: Record<"debug" | "info" | "warn" | "error", number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
  };

  // Track ongoing operations
  private activeAnalysis = new Set<string>();
  private batchTimeouts = new Set<number>();
  // Reactive store of latest analysis results by patchId
  private analysisMap = new Map<string, MergeAnalysisResult>();
  private analysisStore = writable(this.analysisMap);

  constructor(
    workerManager: WorkerManager,
    cacheManager: MergeAnalysisCacheManager,
    config: PatchManagerConfig = {}
  ) {
    this.workerManager = workerManager;
    this.cacheManager = cacheManager;

    // Set default configuration
    this.config = {
      batchSize: config.batchSize ?? 3,
      batchDelay: config.batchDelay ?? 200,
      maxConcurrent: config.maxConcurrent ?? 5,
      logLevel: config.logLevel ?? "warn",
    };
  }

  /**
   * Internal logging helper that respects configured log level
   */
  private log(level: "debug" | "info" | "warn" | "error", ...args: unknown[]) {
    if (this.config.logLevel === "silent") return;
    const current =
      PatchManager.severity[
        this.config.logLevel as Exclude<typeof this.config.logLevel, "silent">
      ] ?? 30;
    const severity = PatchManager.severity[level];
    if (severity < current) return;
    switch (level) {
      case "debug":
        console.debug(...args);
        break;
      case "info":
        console.info?.(...args);
        break;
      case "warn":
        console.warn(...args);
        break;
      case "error":
        console.error(...args);
        break;
    }
  }

  /**
   * Public readable store of merge analyses keyed by patchId
   */
  getAnalysisStore(): Readable<Map<string, MergeAnalysisResult>> {
    return this.analysisStore;
  }

  /**
   * Convenience accessor for a single patch's analysis from the in-memory map
   */
  getAnalysisFor(patchId: string): MergeAnalysisResult | undefined {
    return this.analysisMap.get(patchId);
  }

  /**
   * Update the reactive store for a given patch
   */
  private updateStore(patchId: string, result: MergeAnalysisResult | null): void {
    if (!result) return;
    this.analysisMap.set(patchId, result);
    // Re-emit the same map reference is fine if subscribers do immutable checks by entries
    // but to be safe for change detection, emit a new Map instance
    this.analysisStore.set(new Map(this.analysisMap));
  }

  /**
   * Remove a patch's analysis from the reactive store
   */
  private removeFromStore(patchId: string): void {
    if (this.analysisMap.delete(patchId)) {
      this.analysisStore.set(new Map(this.analysisMap));
    }
  }

  /**
   * Get merge analysis result for a patch (cached or fresh)
   */
  async getMergeAnalysis(
    patch: PatchEvent,
    targetBranch: string,
    canonicalKey: string,
    workerRepoId?: string
  ): Promise<MergeAnalysisResult | null> {
    console.log(`[PatchManager] getMergeAnalysis called for patch ${patch.id.slice(0, 8)}, branch: ${targetBranch}, repo: ${canonicalKey}`);
    
    // First try to get cached result
    const cachedResult = await this.cacheManager.get(patch, targetBranch, canonicalKey);

    // If we have a valid cached result that's not an error, return it
    if (cachedResult && cachedResult.analysis !== "error") {
      this.log(
        "debug",
        `🧠 MergeAnalysis cache hit for patch ${patch.id} → ${cachedResult.analysis} (branch=${targetBranch}, repo=${canonicalKey})`
      );
      console.log(`[PatchManager] Returning cached result:`, cachedResult.analysis);
      return cachedResult;
    }

    console.log(`[PatchManager] No valid cache, performing fresh analysis...`);

    // If no cached result or cached result is an error, perform fresh analysis
    try {
      const freshResult = await this.analyzePatch(patch, targetBranch, canonicalKey, workerRepoId);

      if (freshResult) {
        console.log(`[PatchManager] Fresh analysis complete:`, freshResult.analysis);
        // Cache the fresh result
        await this.cacheManager.set(patch, targetBranch, canonicalKey, freshResult);
        // Publish to reactive store
        this.updateStore(patch.id, freshResult);
        this.log(
          "debug",
          `🧪 MergeAnalysis fresh result for patch ${patch.id} → ${freshResult.analysis} (branch=${targetBranch}, repo=${canonicalKey})`
        );
      } else {
        console.warn(`[PatchManager] Fresh analysis returned null`);
      }

      return freshResult;
    } catch (error) {
      console.error(`[PatchManager] Fresh analysis failed:`, error);
      this.log("error", "PatchManager fresh analysis failed:", error);

      // Return cached error result if we have one, otherwise create new error result
      if (cachedResult && cachedResult.analysis === "error") {
        console.log(`[PatchManager] Returning cached error result`);
        return cachedResult;
      }

      // Create new error result
      const errorResult: MergeAnalysisResult = {
        canMerge: false,
        hasConflicts: false,
        conflictFiles: [],
        conflictDetails: [],
        upToDate: false,
        fastForward: false,
        patchCommits: [],
        analysis: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown analysis error",
      };

      console.log(`[PatchManager] Returning new error result:`, errorResult.errorMessage);
      return errorResult;
    }
  }

  /**
   * Check if merge analysis is available for a patch
   */
  async hasMergeAnalysis(patchId: string): Promise<boolean> {
    return await this.cacheManager.has(patchId);
  }

  /**
   * Force refresh merge analysis for a specific patch
   */
  async refreshMergeAnalysis(
    patch: PatchEvent,
    targetBranch: string,
    canonicalKey: string,
    workerRepoId?: string
  ): Promise<MergeAnalysisResult | null> {
    try {
      // Remove from cache to force refresh
      await this.cacheManager.remove(patch.id);
      this.removeFromStore(patch.id);

      // Perform fresh analysis
      const result = await this.analyzePatch(patch, targetBranch, canonicalKey, workerRepoId);

      if (result) {
        // Cache the new result
        await this.cacheManager.set(patch, targetBranch, canonicalKey, result);
        // Publish to reactive store
        this.updateStore(patch.id, result);
      }

      return result;
    } catch (error) {
      console.error(`Failed to refresh merge analysis for patch ${patch.id}:`, error);
      return null;
    }
  }

  /**
   * Analyze a single patch for merge conflicts
   */
  async analyzePatch(
    patch: PatchEvent,
    targetBranch: string,
    canonicalKey: string,
    workerRepoId?: string
  ): Promise<MergeAnalysisResult | null> {
    // Prevent duplicate analysis
    if (this.activeAnalysis.has(patch.id)) {
      return null;
    }

    this.activeAnalysis.add(patch.id);

    try {
      this.log(
        "debug",
        `🔍 Analyzing patch ${patch.id} (branch=${targetBranch}, repo=${canonicalKey})`
      );
      // Parse the patch for analysis
      const { parseGitPatchFromEvent } = await import("@nostr-git/core");
      const parsedPatch = parseGitPatchFromEvent(patch);

      // Use WorkerManager to perform the analysis
      // NOTE: Do NOT pass rawContent through Comlink - it's too large and causes serialization issues
      // Instead, pass just the metadata and let the worker read the patch content if needed
      const result = await this.workerManager.analyzePatchMerge({
        repoId: canonicalKey,
        patchData: {
          id: parsedPatch.id,
          commits: parsedPatch.commits.map((c) => ({
            oid: c.oid,
            message: c.message,
            author: { name: c.author.name, email: c.author.email },
          })),
          baseBranch: parsedPatch.baseBranch,
          // rawContent removed - worker doesn't actually need it for merge analysis
          rawContent: "", // Empty string to satisfy type, worker uses git operations instead
        },
        targetBranch,
      });
      this.log("debug", `✅ Analysis complete for patch ${patch.id} → ${result.analysis}`);
      return result;
    } catch (error) {
      this.log("error", `Failed to analyze patch ${patch.id}:`, error);
      return null;
    } finally {
      this.activeAnalysis.delete(patch.id);
    }
  }

  /**
   * Process patches in background batches for proactive analysis
   */
  async processInBackground(
    patches: PatchEvent[],
    targetBranch: string,
    canonicalKey: string,
    workerRepoId?: string
  ): Promise<void> {
    if (!patches.length) return;

    // Clear any existing timeouts
    this.clearBatchTimeouts();

    // Cleanup expired cache entries
    this.cacheManager.cleanup();

    // Sort patches by created_at in descending order
    patches.sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return dateB.getTime() - dateA.getTime();
    });

    // Process patches in batches to avoid overwhelming the system
    const { batchSize, batchDelay } = this.config;

    for (let i = 0; i < patches.length; i += batchSize) {
      const batch = patches.slice(i, i + batchSize);

      // Schedule batch processing with staggered delays
      const timeoutId = window.setTimeout(async () => {
        this.log(
          "debug",
          `📦 Processing merge analysis batch size=${batch.length} (branch=${targetBranch}, repo=${canonicalKey})`
        );
        await this.processBatch(batch, targetBranch, canonicalKey, workerRepoId);
        this.batchTimeouts.delete(timeoutId);
      }, i * batchDelay);

      this.batchTimeouts.add(timeoutId);
    }
  }

  /**
   * Process a batch of patches sequentially
   */
  private async processBatch(
    patches: PatchEvent[],
    targetBranch: string,
    canonicalKey: string,
    workerRepoId?: string
  ): Promise<void> {
    for (const patch of patches) {
      try {
        // Check if we already have a cached result
        const cachedResult = await this.cacheManager.get(patch, targetBranch, canonicalKey);
        if (cachedResult) {
          // Ensure store reflects cached value
          this.updateStore(patch.id, cachedResult);
          this.log("debug", `🧠 (bg) cache hit for patch ${patch.id} → ${cachedResult.analysis}`);
          continue;
        }

        // Perform analysis
        const result = await this.analyzePatch(patch, targetBranch, canonicalKey, workerRepoId);

        if (result) {
          // Cache the result
          await this.cacheManager.set(patch, targetBranch, canonicalKey, result);
          // Publish to reactive store
          this.updateStore(patch.id, result);
          this.log("debug", `🧪 (bg) fresh result for patch ${patch.id} → ${result.analysis}`);
        }
      } catch (error) {
        this.log("warn", `Background merge analysis failed for patch ${patch.id}:`, error);
        // Don't cache error results as they might be temporary
      }
    }
  }

  /**
   * Clear all merge analysis cache
   */
  async clearCache(): Promise<void> {
    await this.cacheManager.clear();
    // Clear reactive store as well
    this.analysisMap.clear();
    this.analysisStore.set(new Map());
  }

  /**
   * Get patch statistics (for debugging/monitoring)
   */
  getStats(): {
    activeAnalysis: number;
    scheduledBatches: number;
  } {
    return {
      activeAnalysis: this.activeAnalysis.size,
      scheduledBatches: this.batchTimeouts.size,
    };
  }

  /**
   * Cancel all ongoing operations and cleanup
   */
  dispose(): void {
    // Clear all active analysis
    this.activeAnalysis.clear();

    // Clear all batch timeouts
    this.clearBatchTimeouts();
    // Clear reactive store
    this.analysisMap.clear();
    this.analysisStore.set(new Map());
  }

  /**
   * Clear all scheduled batch timeouts
   */
  private clearBatchTimeouts(): void {
    for (const timeoutId of this.batchTimeouts) {
      clearTimeout(timeoutId);
    }
    this.batchTimeouts.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PatchManagerConfig>): void {
    this.config = { ...this.config, ...config };
    // No-op: config update currently does not require store changes
  }

  // -------------------------
  // Patch DAG helpers
  // -------------------------
  /**
   * Build a light-weight DAG summary from a full graph object (as returned by Repo.getPatchGraph).
   */
  buildDagSummary(graph: {
    nodes?: Map<string, any> | Record<string, any>;
    roots?: string[];
    rootRevisions?: string[];
    edgesCount?: number;
    topParents?: string[];
    parentOutDegree?: Record<string, number>;
    parentChildren?: Record<string, string[]>;
  }): PatchDagSummary {
    const nodeCount = (() => {
      if (!graph?.nodes) return 0;
      if (graph.nodes instanceof Map) return graph.nodes.size;
      if (typeof graph.nodes === "object") return Object.keys(graph.nodes).length;
      return 0;
    })();

    return {
      nodeCount,
      roots: Array.isArray(graph?.roots) ? graph.roots : [],
      rootRevisions: Array.isArray(graph?.rootRevisions) ? graph.rootRevisions : [],
      edgesCount: typeof graph?.edgesCount === "number" ? graph.edgesCount : undefined,
      topParents: Array.isArray(graph?.topParents) ? graph.topParents : undefined,
      parentOutDegree:
        graph && typeof graph.parentOutDegree === "object" ? graph.parentOutDegree : undefined,
      parentChildren:
        graph && typeof graph.parentChildren === "object" ? graph.parentChildren : undefined,
    };
  }

  /**
   * Convenience: obtain DAG summary directly from a Repo-like with getPatchGraph().
   */
  getDagSummaryFromRepo(repo: { getPatchGraph: () => any }): PatchDagSummary | null {
    try {
      const graph = repo.getPatchGraph();
      return this.buildDagSummary(graph);
    } catch (e) {
      this.log("warn", "getDagSummaryFromRepo failed:", e);
      return null;
    }
  }

  // -------------------------
  // Labels helpers
  // -------------------------
  /** Normalize labels for all patches via Repo.getPatchLabels, returning flat and grouped views */
  getLabelsData(repo: {
    patches: Array<{ id: string }>;
    getPatchLabels: (id: string) => any;
  }): LabelsData {
    const toNatural = (s: string) => {
      const idx = s.lastIndexOf(":");
      return idx >= 0 ? s.slice(idx + 1) : s.replace(/^#/, "");
    };

    const byId = new Map<string, string[]>();
    const groupsById = new Map<string, Record<string, string[]>>();

    for (const p of repo.patches || []) {
      const eff: any = repo.getPatchLabels?.(p.id);
      const flat: string[] = Array.isArray(eff?.flat) ? eff.flat.map(String) : [];
      const naturals = flat.map(toNatural);
      byId.set(p.id, naturals);

      const groups: Record<string, string[]> = { Status: [], Type: [], Area: [], Tags: [], Other: [] };
      if (eff?.byNamespace && typeof eff.byNamespace === "object") {
        for (const ns of Object.keys(eff.byNamespace)) {
          const vals = Array.isArray(eff.byNamespace[ns]) ? eff.byNamespace[ns] : [];
          const naturalsNs = vals.map((v: any) => toNatural(String(v)));
          if (ns === "org.nostr.git.status") groups.Status.push(...naturalsNs);
          else if (ns === "org.nostr.git.type") groups.Type.push(...naturalsNs);
          else if (ns === "org.nostr.git.area") groups.Area.push(...naturalsNs);
          else if (ns === "#t") groups.Tags.push(...naturalsNs);
          else groups.Other.push(...naturalsNs);
        }
        for (const k of Object.keys(groups)) groups[k] = Array.from(new Set(groups[k]));
      }
      groupsById.set(p.id, groups);
    }

    const allLabels = Array.from(new Set(Array.from(byId.values()).flat()));
    return { byId, groupsById, allLabels };
  }

  // -------------------------
  // Status helpers
  // -------------------------
  /** Compute resolved state per patch using Repo.resolveStatusFor if available */
  getStatusData(repo: {
    patches: Array<{ id: string; pubkey?: string }>;
    resolveStatusFor?: (
      id: string
    ) => { state: "open" | "draft" | "closed" | "merged" | "resolved" } | null;
  }): StatusData {
    const stateById: StatusData["stateById"] = {};
    const reasonById: StatusData["reasonById"] = {};

    for (const p of repo.patches || []) {
      try {
        const resolved = repo.resolveStatusFor?.(p.id) || null;
        stateById[p.id] = resolved?.state;
        reasonById[p.id] = undefined;
      } catch {
        // ignore and leave undefined
      }
    }

    return { stateById, reasonById };
  }
}
