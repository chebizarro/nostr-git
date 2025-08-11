import {
  type PatchEvent,
} from "@nostr-git/shared-types";
import {
  type MergeAnalysisResult,
} from "@nostr-git/core";
import { WorkerManager } from "./WorkerManager";
import { MergeAnalysisCacheManager } from "./CacheManager";
import { writable, type Readable } from "svelte/store";

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
    };
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
    // First try to get cached result
    const cachedResult = await this.cacheManager.get(patch, targetBranch, canonicalKey);
    
    // If we have a valid cached result that's not an error, return it
    if (cachedResult && cachedResult.analysis !== 'error') {
      console.debug(
        `🧠 MergeAnalysis cache hit for patch ${patch.id} → ${cachedResult.analysis} (branch=${targetBranch}, repo=${canonicalKey})`
      );
      return cachedResult;
    }
    
    // If no cached result or cached result is an error, perform fresh analysis
    try {
      const freshResult = await this.analyzePatch(patch, targetBranch, canonicalKey, workerRepoId);
      
      if (freshResult) {
        // Cache the fresh result
        await this.cacheManager.set(patch, targetBranch, canonicalKey, freshResult);
        // Publish to reactive store
        this.updateStore(patch.id, freshResult);
        console.debug(
          `🧪 MergeAnalysis fresh result for patch ${patch.id} → ${freshResult.analysis} (branch=${targetBranch}, repo=${canonicalKey})`
        );
      }
      
      return freshResult;
    } catch (error) {
      console.error('PatchManager fresh analysis failed:', error);
      
      // Return cached error result if we have one, otherwise create new error result
      if (cachedResult && cachedResult.analysis === 'error') {
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
        analysis: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown analysis error'
      };
      
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
      console.debug(
        `🔍 Analyzing patch ${patch.id} (branch=${targetBranch}, repo=${workerRepoId || canonicalKey})`
      );
      // Parse the patch for analysis
      const { parseGitPatchFromEvent } = await import("@nostr-git/core");
      const parsedPatch = parseGitPatchFromEvent(patch);
      
      // Use WorkerManager to perform the analysis
      const result = await this.workerManager.analyzePatchMerge({
        repoId: workerRepoId || canonicalKey,
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
      console.debug(
        `✅ Analysis complete for patch ${patch.id} → ${result.analysis}`
      );
      return result;
    } catch (error) {
      console.error(`Failed to analyze patch ${patch.id}:`, error);
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

    // Process patches in batches to avoid overwhelming the system
    const { batchSize, batchDelay } = this.config;
    
    for (let i = 0; i < patches.length; i += batchSize) {
      const batch = patches.slice(i, i + batchSize);
      
      // Schedule batch processing with staggered delays
      const timeoutId = window.setTimeout(async () => {
        console.debug(
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
          console.debug(
            `🧠 (bg) cache hit for patch ${patch.id} → ${cachedResult.analysis}`
          );
          continue;
        }


        
        // Perform analysis
        const result = await this.analyzePatch(patch, targetBranch, canonicalKey, workerRepoId);
        
        if (result) {
          // Cache the result
          await this.cacheManager.set(patch, targetBranch, canonicalKey, result);
          // Publish to reactive store
          this.updateStore(patch.id, result);
          console.debug(
            `🧪 (bg) fresh result for patch ${patch.id} → ${result.analysis}`
          );
        }
      } catch (error) {
        console.warn(`Background merge analysis failed for patch ${patch.id}:`, error);
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
}
