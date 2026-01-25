// Branch resolution helpers extracted from git-worker
import type { GitProvider } from '../../git/provider.js';

export async function resolveBranchName(
  git: GitProvider,
  dir: string,
  requestedBranch?: string
): Promise<string> {
  // If a specific branch was requested, try it first and return it directly
  // This is important for user-selected branches that may not exist locally yet
  if (requestedBranch) {
    try {
      await git.resolveRef({ dir, ref: requestedBranch });
      console.log(`[resolveBranchName] Successfully resolved requested branch: ${requestedBranch}`);
      return requestedBranch;
    } catch (error) {
      // If the requested branch doesn't exist locally, still return it
      // The calling code will handle fetching/syncing it
      console.log(`[resolveBranchName] Requested branch "${requestedBranch}" not found locally, but returning it anyway for sync/fetch`);
      return requestedBranch;
    }
  }
  
  // Only use fallback logic when no specific branch was requested
  const branchesToTry = ['main', 'master', 'develop', 'dev'];
  
  // Try the fallback branches
  for (const branchName of branchesToTry) {
    try {
      await git.resolveRef({ dir, ref: branchName });
      return branchName;
    } catch {
      // try next
    }
  }
  
  // If all specific branches fail, try to list available branches
  let branches: string[];
  try {
    branches = await git.listBranches({ dir });
  } catch (error) {
    // If listBranches fails, throw the error - this is a critical failure
    console.error('Failed to list branches:', error);
    throw error;
  }

  if (branches.length > 0) {
    const firstBranch = branches[0];
    console.warn(
      `All specific branch resolution attempts failed, using first available branch: ${firstBranch}`
    );
    return firstBranch;
  }

  // No branches found at all - this is an error condition
  throw new Error(`No branches found in repository at ${dir}`);
}
