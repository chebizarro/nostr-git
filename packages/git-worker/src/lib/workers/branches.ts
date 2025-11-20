// Branch resolution helpers extracted from git-worker
import type { GitProvider } from '@nostr-git/git-wrapper';

export async function resolveRobustBranch(
  git: GitProvider,
  dir: string,
  requestedBranch?: string
): Promise<string> {
  const branchesToTry = [requestedBranch, 'main', 'master', 'develop', 'dev'].filter(
    Boolean
  ) as string[];
  
  // First try the specific branches
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
