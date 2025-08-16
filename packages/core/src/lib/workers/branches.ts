// Branch resolution helpers extracted from git-worker
import type { GitProvider } from '@nostr-git/git-wrapper';

export async function resolveRobustBranch(git: GitProvider, dir: string, requestedBranch?: string): Promise<string> {
  const branchesToTry = [requestedBranch, 'main', 'master', 'develop', 'dev'].filter(Boolean) as string[];
  for (const branchName of branchesToTry) {
    try {
      await git.resolveRef({ dir, ref: branchName });
      return branchName;
    } catch {
      // try next
    }
  }
  try {
    const branches = await git.listBranches({ dir });
    if (branches.length > 0) {
      const firstBranch = branches[0];
      console.warn(`All specific branch resolution attempts failed, using first available branch: ${firstBranch}`);
      return firstBranch;
    }
  } catch (error) {
    console.warn('Failed to list branches:', error);
  }
  throw new Error(`No branches found in repository at ${dir}. Tried: ${branchesToTry.join(', ')}`);
}
