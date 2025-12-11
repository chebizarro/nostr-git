import { getGitWorker } from '@nostr-git/git-worker';
import type { MergeAnalysisResult } from './merge-analysis.js';
import { buildMergeMetadataEventFromAnalysis, buildConflictMetadataEventFromAnalysis } from './merge-analysis.js';
import type { RepoAddressA } from '@nostr-git/shared-types';
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
  const { api, worker } = await getGitWorker(onProgress);

  try {
    // Serialize patch data for worker communication
    const patchData = {
      id: patch.id,
      commits: patch.commits.map((c) => ({
        oid: c.oid,
        message: c.message,
        author: { name: c.author.name, email: c.author.email },
      })),
      baseBranch: patch.baseBranch,
      rawContent: (patch as any).raw?.content ?? '',
    };

    const result = await api.analyzePatchMerge({ repoId, patchData, targetBranch });
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
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    worker.terminate();
  }
}

/**
 * Analyze and produce merge/conflict metadata events for publication.
 */
export async function analyzePatchMergeWithMetadata(
  repoId: string,
  repoAddr: RepoAddressA,
  rootId: string,
  patch: Patch,
  targetBranch?: string,
  onProgress?: (event: any) => void
): Promise<{
  analysis: MergeAnalysisResult;
  mergeEvent: ReturnType<typeof buildMergeMetadataEventFromAnalysis>;
  conflictEvent?: ReturnType<typeof buildConflictMetadataEventFromAnalysis>;
}> {
  const analysis = await analyzePatchMerge(repoId, patch, targetBranch, onProgress);
  const mergeEvent = buildMergeMetadataEventFromAnalysis({
    repoAddr,
    rootId,
    targetBranch: targetBranch || (patch as any).baseBranch,
    baseBranch: (patch as any).baseBranch,
    result: analysis,
  });
  const conflictEvent = buildConflictMetadataEventFromAnalysis({ repoAddr, rootId, result: analysis });
  return { analysis, mergeEvent, conflictEvent };
}
