import {
  type PatchEvent,
} from "@nostr-git/shared-types";
import {
  type MergeAnalysisResult,
} from "@nostr-git/core";
import { WorkerManager } from "./WorkerManager";
import { MergeAnalysisCacheManager } from "./CacheManager";

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
   * Get merge analysis result for a patch (cached or fresh)
   */
  async getMergeAnalysis(patch: PatchEvent, targetBranch: string, repoId: string): Promise<MergeAnalysisResult | null> {
    // First try to get cached result
    const cachedResult = await this.cacheManager.get(patch, targetBranch, repoId);
    
    // If we have a valid cached result that's not an error, return it
    if (cachedResult && cachedResult.analysis !== 'error') {
      return cachedResult;
    }
    
    // If no cached result or cached result is an error, perform fresh analysis
    try {
      const freshResult = await this.analyzePatch(patch, targetBranch, repoId);
      
      if (freshResult) {
        // Cache the fresh result
        await this.cacheManager.set(patch, targetBranch, repoId, freshResult);
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
    repoId: string
  ): Promise<MergeAnalysisResult | null> {
    try {
      // Remove from cache to force refresh
      await this.cacheManager.remove(patch.id);

      // Perform fresh analysis
      const result = await this.analyzePatch(patch, targetBranch, repoId);
      
      if (result) {
        // Cache the new result
        await this.cacheManager.set(patch, targetBranch, repoId, result);

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
    repoId: string
  ): Promise<MergeAnalysisResult | null> {
    // Prevent duplicate analysis
    if (this.activeAnalysis.has(patch.id)) {

      return null;
    }

    this.activeAnalysis.add(patch.id);

    try {
      // Parse the patch for analysis
      const { parseGitPatchFromEvent } = await import("@nostr-git/core");
      const parsedPatch = parseGitPatchFromEvent(patch);
      
      // Use WorkerManager to perform the analysis
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
    repoId: string
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
        await this.processBatch(batch, targetBranch, repoId);
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
    repoId: string
  ): Promise<void> {
    for (const patch of patches) {
      try {
        // Check if we already have a cached result
        const cachedResult = await this.cacheManager.get(patch, targetBranch, repoId);
        if (cachedResult) {

          continue;
        }


        
        // Perform analysis
        const result = await this.analyzePatch(patch, targetBranch, repoId);
        
        if (result) {
          // Cache the result
          await this.cacheManager.set(patch, targetBranch, repoId, result);

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

  }
}
