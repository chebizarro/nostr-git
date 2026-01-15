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
  try {
    const branches = await git.listBranches({ dir });
    if (branches.length > 0) {
      const firstBranch = branches[0];
      console.warn(
        `All specific branch resolution attempts failed, using first available branch: ${firstBranch}`
      );
      return firstBranch;
    }
  } catch (error) {
    console.warn('Failed to list branches:', error);
  }
  
  // No branches found locally - try to use HEAD as fallback
  // This handles shallow clones where refs/heads/* may not exist yet
  // Use depth: 1 to avoid following symbolic refs that point to non-existent branches
  try {
    const headRef = await git.resolveRef({ dir, ref: 'HEAD', depth: 1 });
    if (headRef && headRef.length === 40) {
      // Got a commit OID - repo has commits but no branch refs
      console.log(`[resolveBranchName] No branches found, but HEAD exists (${headRef.substring(0, 8)}). Using 'main' as default branch name.`);
      return 'main';
    }
  } catch {
    // depth: 1 failed
  }
  
  // Try to get the latest commit from the log (works even without branch refs)
  try {
    const commits = await git.log({ dir, depth: 1 });
    if (commits && commits.length > 0) {
      console.log(`[resolveBranchName] Found commits in log, using 'main' as default branch name.`);
      return 'main';
    }
  } catch {
    // git.log also failed
  }
  
  // Last resort: return 'main' as a sensible default for new/empty repos
  // This allows the UI to display something and attempt operations
  console.warn(`[resolveBranchName] No branches found in repository at ${dir}. Returning 'main' as default.`);
  return 'main';
}
