import { getGitWorker } from './git-worker-client.js';
import type { MergeAnalysisResult } from './merge-analysis.js';
import type { Patch } from '@nostr-git/shared-types';

/**
 * Analyze if a patch can be merged cleanly into the target branch
 */
export async function analyzePatchMerge(
  repoId: string,
  patch: Patch,
  targetBranch?: string,
  onProgress?: (event: any) => void
): Promise<MergeAnalysisResult> {
  const { api, worker } = getGitWorker(onProgress);
  
  try {
    // Serialize patch data for worker communication
    const patchData = {
      id: patch.id,
      commits: patch.commits.map(c => ({
        oid: c.oid,
        message: c.message,
        author: { name: c.author.name, email: c.author.email }
      })),
      baseBranch: patch.baseBranch,
      rawContent: patch.raw.content
    };
    
    const result = await api.analyzePatchMerge({
      repoId,
      patchData,
      targetBranch
    });
    
    return result;
  } catch (error) {
    console.error('Error analyzing patch merge:', error);
    return {
      canMerge: false,
      hasConflicts: false,
      conflictFiles: [],
      conflictDetails: [],
      upToDate: false,
      fastForward: false,
      patchCommits: [],
      analysis: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    };
  } finally {
    worker.terminate();
  }
}
