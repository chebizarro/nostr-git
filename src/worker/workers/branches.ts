// Branch resolution helpers extracted from git-worker
import type { GitProvider } from '../../git/provider.js';

export async function resolveBranchName(
  git: GitProvider,
  dir: string,
  requestedBranch?: string,
  options?: { strict?: boolean }
): Promise<string> {
  const branchesToTry = ['main', 'master', 'develop', 'dev'];

  // If a specific branch was requested, try it first
  if (requestedBranch) {
    try {
      await git.resolveRef({ dir, ref: requestedBranch });
      console.log(`[resolveBranchName] Successfully resolved requested branch: ${requestedBranch}`);
      return requestedBranch;
    } catch (error) {
      // Requested branch doesn't exist locally
      // In strict mode (user explicitly selected this branch), return it anyway for fetch
      if (options?.strict) {
        console.log(`[resolveBranchName] Requested branch "${requestedBranch}" not found locally (strict mode), returning for fetch`);
        return requestedBranch;
      }

      // Non-strict mode: the requested branch might be stale metadata (e.g., NIP-34 says 'master' but repo uses 'main')
      // Try common fallback branches first before giving up
      console.log(`[resolveBranchName] Requested branch "${requestedBranch}" not found locally, trying fallbacks...`);

      for (const fallbackBranch of branchesToTry) {
        if (fallbackBranch === requestedBranch) continue; // Already tried this one
        try {
          await git.resolveRef({ dir, ref: fallbackBranch });
          console.log(`[resolveBranchName] Using fallback branch '${fallbackBranch}' instead of requested '${requestedBranch}'`);
          return fallbackBranch;
        } catch {
          // Try next fallback
        }
      }

      // No fallbacks worked, return the requested branch for the caller to attempt fetch
      console.log(`[resolveBranchName] No fallback branches found, returning requested branch "${requestedBranch}" for fetch attempt`);
      return requestedBranch;
    }
  }

  // No specific branch requested - use fallback logic
  
  // Try HEAD first - it's the most reliable way to find the current branch
  try {
    const headOid = await git.resolveRef({ dir, ref: 'HEAD' });
    if (headOid) {
      console.log(`[resolveBranchName] Resolved HEAD to OID ${headOid.substring(0, 8)}`);
      return 'HEAD';
    }
  } catch {
    // HEAD not available, try named branches
  }

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
    // If listBranches fails, try remote branches as fallback
    console.warn('Failed to list local branches, trying remote branches:', error);
    try {
      const remoteBranches = await git.listBranches({ dir, remote: 'origin' });
      if (remoteBranches.length > 0) {
        console.log(`[resolveBranchName] Found ${remoteBranches.length} remote branches, using first: ${remoteBranches[0]}`);
        return remoteBranches[0];
      }
    } catch (remoteError) {
      console.warn('Failed to list remote branches:', remoteError);
    }
    throw error;
  }

  if (branches.length > 0) {
    const firstBranch = branches[0];
    console.warn(
      `All specific branch resolution attempts failed, using first available branch: ${firstBranch}`
    );
    return firstBranch;
  }

  // No local branches found - try remote branches
  try {
    const remoteBranches = await git.listBranches({ dir, remote: 'origin' });
    if (remoteBranches.length > 0) {
      console.log(`[resolveBranchName] No local branches, using remote branch: ${remoteBranches[0]}`);
      return remoteBranches[0];
    }
  } catch (remoteError) {
    console.warn('[resolveBranchName] Failed to list remote branches:', remoteError);
  }

  // No branches found at all - this is an error condition
  throw new Error(`No branches found in repository at ${dir}`);
}
