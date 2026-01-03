// Branch resolution helpers extracted from git-worker
import type { GitProvider } from '@nostr-git/git';

export async function resolveRobustBranch(
  git: GitProvider,
  dir: string,
  requestedBranch?: string
): Promise<string> {
  // If a specific branch was requested, try it first and return it directly
  // This is important for user-selected branches that may not exist locally yet
  if (requestedBranch) {
    try {
      await git.resolveRef({ dir, ref: requestedBranch });
      console.log(`[resolveRobustBranch] Successfully resolved requested branch: ${requestedBranch}`);
      return requestedBranch;
    } catch (error) {
      // If the requested branch doesn't exist locally, still return it
      // The calling code will handle fetching/syncing it
      console.log(`[resolveRobustBranch] Requested branch "${requestedBranch}" not found locally, but returning it anyway for sync/fetch`);
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
  try {
    const branches = await git.listBranches({ dir });
    if (branches.length > 0) {
      const firstBranch = branches[0];
      console.warn(
        `All specific branch resolution attempts failed, using first available branch: ${firstBranch}`
      );
      return firstBranch;
    } else {
      // No branches found - this might be an empty repository
      console.warn(`No branches found in repository at ${dir}. This might be an empty or newly initialized repository.`);
      throw new Error(`No branches found in repository at ${dir}. Repository may be empty or not properly initialized. Tried: ${branchesToTry.join(', ')}`);
    }
  } catch (error) {
    console.warn('Failed to list branches:', error);
    throw new Error(`No branches found in repository at ${dir}. Tried: ${branchesToTry.join(', ')}`);
  }
}
