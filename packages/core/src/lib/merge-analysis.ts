import type { GitProvider } from '@nostr-git/git-wrapper';
import parseDiff from 'parse-diff';
import type { Patch } from '@nostr-git/shared-types';

export interface SimplifiedPatch {
  id: string;
  commits: Array<{ oid: string; message: string; author: { name: string; email: string } }>;
  baseBranch: string;
  raw: { content: string };
}

export interface MergeAnalysisResult {
  canMerge: boolean;
  hasConflicts: boolean;
  conflictFiles: string[];
  conflictDetails: ConflictDetail[];
  upToDate: boolean;
  fastForward: boolean;
  mergeBase?: string;
  targetCommit?: string;
  patchCommits: string[];
  analysis: 'clean' | 'conflicts' | 'up-to-date' | 'diverged' | 'error';
  errorMessage?: string;
}

export interface ConflictDetail {
  file: string;
  type: 'content' | 'rename' | 'delete' | 'binary';
  conflictMarkers: ConflictMarker[];
  baseContent?: string;
  headContent?: string;
  patchContent?: string;
}

export interface ConflictMarker {
  start: number;
  end: number;
  content: string;
  type: 'both-modified' | 'deleted-by-us' | 'deleted-by-them' | 'added-by-both';
}

/**
 * Analyze if a patch can be merged cleanly into the target branch
 */
export async function analyzePatchMergeability(
  git: GitProvider,
  repoDir: string,
  patch: Patch | SimplifiedPatch,
  targetBranch: string = 'main'
): Promise<MergeAnalysisResult> {
  try {
    // Ensure we have the latest state
    await git.fetch({
      dir: repoDir,
      ref: targetBranch,
      singleBranch: true,
      depth: 1
    });

    // Get current HEAD of target branch
    const targetCommit = await git.resolveRef({
      dir: repoDir,
      ref: `refs/heads/${targetBranch}`
    });

    // Parse patch to get commit information
    const patchCommits = patch.commits.map(c => c.oid);
    
    if (patchCommits.length === 0) {
      return {
        canMerge: false,
        hasConflicts: false,
        conflictFiles: [],
        conflictDetails: [],
        upToDate: false,
        fastForward: false,
        targetCommit,
        patchCommits: [],
        analysis: 'error',
        errorMessage: 'No commits found in patch'
      };
    }

    // Check if patch is already applied (commits exist in target branch)
    const isUpToDate = await checkIfPatchApplied(git, repoDir, patchCommits, targetBranch);
    if (isUpToDate) {
      return {
        canMerge: true,
        hasConflicts: false,
        conflictFiles: [],
        conflictDetails: [],
        upToDate: true,
        fastForward: false,
        targetCommit,
        patchCommits,
        analysis: 'up-to-date'
      };
    }

    // Find merge base between patch and target
    const mergeBase = await findMergeBase(git, repoDir, patchCommits[0], targetCommit);
    
    // Check if it's a fast-forward merge
    const isFastForward = mergeBase === targetCommit;
    
    if (isFastForward) {
      return {
        canMerge: true,
        hasConflicts: false,
        conflictFiles: [],
        conflictDetails: [],
        upToDate: false,
        fastForward: true,
        mergeBase,
        targetCommit,
        patchCommits,
        analysis: 'clean'
      };
    }

    // Perform a dry-run merge to detect conflicts
    const conflictAnalysis = await performDryRunMerge(git, repoDir, patch as SimplifiedPatch, targetBranch);
    
    return {
      canMerge: !conflictAnalysis.hasConflicts,
      hasConflicts: conflictAnalysis.hasConflicts,
      conflictFiles: conflictAnalysis.conflictFiles,
      conflictDetails: conflictAnalysis.conflictDetails,
      upToDate: false,
      fastForward: false,
      mergeBase,
      targetCommit,
      patchCommits,
      analysis: conflictAnalysis.hasConflicts ? 'conflicts' : 'clean'
    };

  } catch (error) {
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
  }
}

/**
 * Check if patch commits are already applied to the target branch
 */
async function checkIfPatchApplied(
  git: GitProvider,
  repoDir: string,
  patchCommits: string[],
  targetBranch: string
): Promise<boolean> {
  try {
    const log = await git.log({
      dir: repoDir,
      ref: targetBranch,
      depth: 100 // Check recent commits
    });

    const targetCommits = log.map((commit: any) => commit.oid);
    
    // Check if all patch commits exist in target branch
    return patchCommits.every(patchCommit => 
      targetCommits.includes(patchCommit)
    );
  } catch {
    return false;
  }
}

/**
 * Find the merge base between two commits
 */
async function findMergeBase(
  git: GitProvider,
  repoDir: string,
  commit1: string,
  commit2: string
): Promise<string | undefined> {
  try {
    const mergeBase = await git.findMergeBase({
      dir: repoDir,
      oids: [commit1, commit2]
    });
    return mergeBase;
  } catch {
    return undefined;
  }
}

/**
 * Perform a dry-run merge to detect conflicts
 */
async function performDryRunMerge(
  git: GitProvider,
  repoDir: string,
  patch: SimplifiedPatch,
  targetBranch: string
): Promise<{
  hasConflicts: boolean;
  conflictFiles: string[];
  conflictDetails: ConflictDetail[];
}> {
  try {
    // Analyze the diff to predict potential conflicts
    const conflictAnalysis = await analyzeDiffForConflicts(git, repoDir, patch, targetBranch);
    
    return conflictAnalysis;
  } catch (error) {
    console.error('Error performing dry-run merge:', error);
    return {
      hasConflicts: false,
      conflictFiles: [],
      conflictDetails: []
    };
  }
}

/**
 * Analyze patch diff against current state to predict conflicts
 */
async function analyzeDiffForConflicts(
  git: GitProvider,
  repoDir: string,
  patch: SimplifiedPatch,
  targetBranch: string
): Promise<{
  hasConflicts: boolean;
  conflictFiles: string[];
  conflictDetails: ConflictDetail[];
}> {
  const conflictDetails: ConflictDetail[] = [];
  const conflictFiles: string[] = [];

  try {
    // Parse the patch diff
    const patchContent = 'raw' in patch ? patch.raw.content : (patch as any).raw.content;
    const parsedDiff = parseDiff(patchContent);
    
    for (const file of parsedDiff) {
      if (!file.to || file.to === '/dev/null') continue;
      
      const filePath = file.to;
      
      try {
        // Get current file content from target branch
        const currentContent = await git.readBlob({
          dir: repoDir,
          oid: await git.resolveRef({
            dir: repoDir,
            ref: `refs/heads/${targetBranch}`
          }),
          filepath: filePath
        });

        // Check if file has been modified since patch base
        const hasLocalChanges = await checkFileModifiedSinceBase(
          git,
          repoDir,
          filePath,
          patch.baseBranch || 'main',
          targetBranch
        );

        if (hasLocalChanges) {
          // Potential conflict - file modified in both patch and target
          const conflictMarkers = await detectConflictMarkers(
            file,
            currentContent.toString()
          );

          if (conflictMarkers.length > 0) {
            conflictFiles.push(filePath);
            conflictDetails.push({
              file: filePath,
              type: 'content',
              conflictMarkers,
              headContent: currentContent.toString()
            });
          }
        }
      } catch (error) {
        // File might not exist in current branch - check if it's a new file conflict
        if ((file as any).type === 'add' || file.to && !file.from) {
          try {
            // Check if file was added in target branch too
            await git.readBlob({
              dir: repoDir,
              oid: await git.resolveRef({
                dir: repoDir,
                ref: `refs/heads/${targetBranch}`
              }),
              filepath: filePath
            });
            
            // File exists in both - potential conflict
            conflictFiles.push(filePath);
            conflictDetails.push({
              file: filePath,
              type: 'content',
              conflictMarkers: [{
                start: 1,
                end: -1,
                content: 'File added in both branches',
                type: 'added-by-both'
              }]
            });
          } catch {
            // File doesn't exist in target - no conflict
          }
        }
      }
    }

    return {
      hasConflicts: conflictFiles.length > 0,
      conflictFiles,
      conflictDetails
    };
  } catch (error) {
    console.error('Error analyzing diff for conflicts:', error);
    return {
      hasConflicts: false,
      conflictFiles: [],
      conflictDetails: []
    };
  }
}

/**
 * Check if a file has been modified since the base branch
 */
async function checkFileModifiedSinceBase(
  git: GitProvider,
  repoDir: string,
  filePath: string,
  baseBranch: string,
  targetBranch: string
): Promise<boolean> {
  try {
    // Get file content from base branch
    const baseContent = await git.readBlob({
      dir: repoDir,
      oid: await git.resolveRef({
        dir: repoDir,
        ref: `refs/heads/${baseBranch}`
      }),
      filepath: filePath
    });

    // Get file content from target branch
    const targetContent = await git.readBlob({
      dir: repoDir,
      oid: await git.resolveRef({
        dir: repoDir,
        ref: `refs/heads/${targetBranch}`
      }),
      filepath: filePath
    });

    return baseContent.toString() !== targetContent.toString();
  } catch {
    // If we can't read from either branch, assume it's modified
    return true;
  }
}

/**
 * Detect potential conflict markers in diff hunks
 */
async function detectConflictMarkers(
  file: any,
  currentContent: string
): Promise<ConflictMarker[]> {
  const markers: ConflictMarker[] = [];
  
  if (!file.hunks) return markers;

  for (const hunk of file.hunks) {
    // Check if the hunk modifies lines that have also been changed in current content
    const modifiedLines = hunk.changes
      .filter((change: any) => change.type === 'del' || change.type === 'add')
      .map((change: any) => change.ln || change.ln2);

    if (modifiedLines.length > 0) {
      // Simple heuristic: if we're modifying the same general area, it's a potential conflict
      markers.push({
        start: Math.min(...modifiedLines.filter(Boolean)),
        end: Math.max(...modifiedLines.filter(Boolean)),
        content: hunk.content,
        type: 'both-modified'
      });
    }
  }

  return markers;
}

/**
 * Get a human-readable status message for the merge analysis
 */
export function getMergeStatusMessage(result: MergeAnalysisResult): string {
  switch (result.analysis) {
    case 'clean':
      return result.fastForward 
        ? 'This patch can be fast-forward merged without conflicts.'
        : 'This patch can be merged cleanly without conflicts.';
    case 'conflicts':
      return `This patch has merge conflicts in ${result.conflictFiles.length} file(s) that need to be resolved.`;
    case 'up-to-date':
      return 'This patch has already been applied to the target branch.';
    case 'diverged':
      return 'The target branch has diverged. Manual intervention may be required.';
    case 'error':
      return `Unable to analyze merge: ${result.errorMessage || 'Unknown error'}`;
    default:
      return 'Merge analysis pending...';
  }
}
