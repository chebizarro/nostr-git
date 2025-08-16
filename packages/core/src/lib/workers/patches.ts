import type { GitProvider } from '@nostr-git/git-wrapper';
import type { MergeAnalysisResult } from '../merge-analysis.js';

export interface AnalyzePatchMergeOptions {
  repoId: string;
  patchData: {
    id: string;
    commits: Array<{ oid: string; message: string; author: { name: string; email: string } }>;
    baseBranch: string;
    rawContent: string;
  };
  targetBranch?: string;
}

export async function analyzePatchMergeUtil(
  git: GitProvider,
  opts: AnalyzePatchMergeOptions,
  deps: {
    rootDir: string;
    canonicalRepoKey: (id: string) => string;
    resolveRobustBranch: (dir: string, requested?: string) => Promise<string>;
    analyzePatchMergeability: (
      git: GitProvider,
      dir: string,
      patch: any,
      targetBranch: string
    ) => Promise<MergeAnalysisResult>;
  }
): Promise<MergeAnalysisResult> {
  const { repoId, patchData, targetBranch } = opts;
  const { rootDir, canonicalRepoKey, resolveRobustBranch, analyzePatchMergeability } = deps;
  try {
    const key = canonicalRepoKey(repoId);
    const dir = `${rootDir}/${key}`;

    // Resolve target branch robustly
    const effectiveTargetBranch = await resolveRobustBranch(dir, targetBranch || patchData.baseBranch);

    // Prepare patch structure for analysis
    const patch = {
      id: patchData.id,
      commits: patchData.commits,
      baseBranch: patchData.baseBranch,
      raw: { content: patchData.rawContent }
    };

    // Delegate to analysis function
    const result = await analyzePatchMergeability(git, dir, patch as any, effectiveTargetBranch);
    return result;
  } catch (error) {
    return {
      canMerge: false,
      hasConflicts: false,
      conflictFiles: [],
      conflictDetails: [],
      upToDate: false,
      fastForward: false,
      targetCommit: undefined,
      remoteCommit: undefined,
      patchCommits: [],
      analysis: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// ------------------------------
// Patch application helpers/util
// ------------------------------

export interface ApplyPatchAndPushOptions {
  repoId: string;
  patchData: {
    id: string;
    commits: Array<{ oid: string; message: string; author: { name: string; email: string } }>;
    baseBranch: string;
    rawContent: string;
  };
  targetBranch?: string;
  mergeCommitMessage?: string;
  authorName: string;
  authorEmail: string;
  onProgress?: (step: string, progress: number) => void;
}

// Minimal fs interface used by this util (provider fs)
interface ProviderFsLike {
  promises: {
    mkdir: (path: string, opts?: { recursive?: boolean }) => Promise<void>;
    readFile: (path: string, encoding: string) => Promise<string>;
    writeFile: (path: string, data: string, encoding: string) => Promise<void>;
  };
}

function parsePatchContent(patchLines: string[]): Array<{
  filepath: string;
  type: 'add' | 'modify' | 'delete' | 'unsupported';
  content: string;
}> {
  const changes: Array<{ filepath: string; type: 'add' | 'modify' | 'delete' | 'unsupported'; content: string }> = [];
  let currentFile: string | null = null;
  let currentContent: string[] = [];
  let currentType: 'add' | 'modify' | 'delete' | 'unsupported' = 'modify';
  let inFileDiff = false;
  let isNewFile = false;
  let isDeletedFile = false;
  let sawUnsupported = false;

  for (const line of patchLines) {
    if (!line || typeof line !== 'string') continue;
    if (line.startsWith('diff --git')) {
      // finalize previous
      if (currentFile) {
        changes.push({ filepath: currentFile, type: currentType, content: currentContent.join('\n') });
      }
      const match = line.match(/diff --git a\/(.*) b\/(.*)/);
      currentFile = match ? match[2] : null;
      // reset flags
      currentContent = [];
      inFileDiff = false;
      isNewFile = false;
      isDeletedFile = false;
      sawUnsupported = false;
      continue;
    }

    // Unsupported patterns detection
    if (line.startsWith('GIT binary patch') || line.includes('Binary files') || line.includes('binary files')) {
      sawUnsupported = true;
      currentType = 'unsupported';
      continue;
    }
    if (line.startsWith('rename from ') || line.startsWith('rename to ')) {
      sawUnsupported = true;
      currentType = 'unsupported';
      continue;
    }

    if (line.startsWith('new file mode')) {
      isNewFile = true;
      currentType = 'add';
      continue;
    }
    if (line.startsWith('deleted file mode')) {
      isDeletedFile = true;
      currentType = 'delete';
      continue;
    }
    if (line.startsWith('@@')) {
      inFileDiff = true;
      // Only set type from flags if not already explicitly set to add/delete
      if (currentType !== 'add' && currentType !== 'delete') {
        currentType = isDeletedFile ? 'delete' : isNewFile ? 'add' : 'modify';
      }
      currentContent.push(line);
      continue;
    }
    if (inFileDiff && currentFile) {
      currentContent.push(line);
    }
  }
  if (currentFile && currentContent.length > 0) {
    changes.push({ filepath: currentFile, type: currentType, content: currentContent.join('\n') });
  }
  return changes;
}

function extractNewFileContentFromPatch(patchContent: string): string {
  const lines = patchContent.split('\n');
  const contentLines: string[] = [];
  let inContent = false;
  for (const line of lines) {
    if (line.startsWith('@@')) { inContent = true; continue; }
    if (!inContent) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) contentLines.push(line.substring(1));
    else if (!line.startsWith('-') && !line.startsWith('\\')) contentLines.push(line.startsWith(' ') ? line.substring(1) : line);
  }
  return contentLines.join('\n');
}

function applyUnifiedDiffPatch(existingContent: string, patchContent: string): string {
  const existingLines = existingContent.split('\n');
  const patchLines = patchContent.split('\n');
  const resultLines: string[] = [];
  let existingIndex = 0;
  let inHunk = false;
  let hunkOldStart = 0;
  let hunkNewStart = 0;
  for (const line of patchLines) {
    const hunkMatch = line.match(/^@@\s+-?(\d+),?\d*\s+\+(\d+),?\d*\s+@@/);
    if (hunkMatch) {
      hunkOldStart = parseInt(hunkMatch[1]) - 1;
      hunkNewStart = parseInt(hunkMatch[2]) - 1;
      while (existingIndex < hunkOldStart) { resultLines.push(existingLines[existingIndex]); existingIndex++; }
      inHunk = true;
      continue;
    }
    if (inHunk) {
      if (line.startsWith(' ')) { resultLines.push(line.substring(1)); existingIndex++; }
      else if (line.startsWith('+')) { resultLines.push(line.substring(1)); }
      else if (line.startsWith('-')) { existingIndex++; }
      else if (line.startsWith('\\')) { continue; }
      else { inHunk = false; }
    }
  }
  while (existingIndex < existingLines.length) { resultLines.push(existingLines[existingIndex]); existingIndex++; }
  return resultLines.join('\n');
}

export async function applyPatchAndPushUtil(
  git: GitProvider,
  opts: ApplyPatchAndPushOptions,
  deps: {
    rootDir: string;
    canonicalRepoKey: (id: string) => string;
    resolveRobustBranch: (dir: string, requested?: string) => Promise<string>;
    ensureFullClone: (args: { repoId: string; branch?: string; depth?: number }) => Promise<any>;
    getAuthCallback: (url: string) => any;
    getConfiguredAuthHosts?: () => string[];
    getProviderFs: (git: GitProvider) => ProviderFsLike;
  }
): Promise<{
  success: boolean;
  error?: string;
  mergeCommitOid?: string;
  pushedRemotes?: string[];
  skippedRemotes?: string[];
  warning?: string;
  pushErrors?: Array<{ remote: string; url: string; error: string; code: string; stack: string }>;
}> {
  const { repoId, patchData, targetBranch, mergeCommitMessage, authorName, authorEmail } = opts;
  const progress = opts.onProgress || (() => {});
  const { rootDir, canonicalRepoKey, resolveRobustBranch, ensureFullClone, getAuthCallback, getConfiguredAuthHosts, getProviderFs } = deps;

  try {
    const key = canonicalRepoKey(repoId);
    const dir = `${rootDir}/${key}`;
    progress('Initializing merge...', 0);

    const effectiveTargetBranch = await resolveRobustBranch(dir, targetBranch);
    progress('Branch resolved', 10);

    await ensureFullClone({ repoId, branch: effectiveTargetBranch });
    progress('Repository prepared', 20);

    // Checkout target branch
    await git.checkout({ dir, ref: effectiveTargetBranch });
    progress('Checked out target branch', 40);

    // Apply patch (simplified unified diff application)
    if (!patchData.rawContent || typeof patchData.rawContent !== 'string') {
      throw new Error('Patch rawContent must be a non-empty string');
    }
    const patchLines = patchData.rawContent.split('\n');
    const fileChanges = parsePatchContent(patchLines);
    const fs = getProviderFs(git);

    // Fail fast on unsupported changes
    const unsupported = fileChanges.find(c => c.type === 'unsupported');
    if (unsupported) {
      return { success: false, error: 'Unsupported patch features detected (rename/binary). Aborting.' };
    }

    for (const change of fileChanges) {
      if (change.type === 'modify' || change.type === 'add') {
        const fullPath = `${dir}/${change.filepath}`;
        const pathParts = change.filepath.split('/');
        if (pathParts.length > 1) {
          const dirPath = pathParts.slice(0, -1).join('/');
          const fullDirPath = `${dir}/${dirPath}`;
          try { await fs.promises.mkdir(fullDirPath, { recursive: true }); } catch {}
        }
        let finalContent = '';
        if (change.type === 'add') {
          finalContent = extractNewFileContentFromPatch(change.content);
        } else {
          try {
            const existingContent = await fs.promises.readFile(fullPath, 'utf8');
            finalContent = applyUnifiedDiffPatch(existingContent, change.content);
          } catch {
            finalContent = extractNewFileContentFromPatch(change.content);
          }
        }
        await fs.promises.writeFile(fullPath, finalContent, 'utf8');
        await git.add({ dir, filepath: change.filepath });
      } else if (change.type === 'delete') {
        await git.remove({ dir, filepath: change.filepath });
      }
    }

    progress('Patch applied', 60);

    // Verify there are actually staged/working changes before committing
    try {
      const status = await (git as any).statusMatrix({ dir });
      const hasChanges = Array.isArray(status) && status.some((row: any[]) => {
        // isomorphic-git statusMatrix: [filepath, head, workdir, stage]
        const head = row?.[1];
        const workdir = row?.[2];
        const stage = row?.[3];
        // Any difference between head and workdir or anything staged indicates changes
        return head !== workdir || stage !== 0;
      });
      if (!hasChanges) {
        return { success: false, error: 'No changes to apply - patch may already be merged or invalid' };
      }
      progress('Changes staged', 70);
    } catch {
      // If statusMatrix is unavailable, proceed to commit (best-effort)
      progress('Proceeding without status validation', 70);
    }

    // Create merge commit
    const defaultMessage = `Merge patch: ${patchData.id.slice(0, 8)}`;
    const commitMessage = mergeCommitMessage || defaultMessage;
    const mergeCommitOid = await git.commit({ dir, message: commitMessage, author: { name: authorName, email: authorEmail } });
    progress('Merge commit created', 80);

    // Push to remotes
    const remotes = await git.listRemotes({ dir });
    const pushedRemotes: string[] = [];
    const skippedRemotes: string[] = [];
    if (remotes.length === 0) {
      return { success: true, mergeCommitOid, pushedRemotes: [], skippedRemotes: [], warning: 'No remotes configured - changes only applied locally' };
    }

    const pushErrors: Array<{ remote: string; url: string; error: string; code: string; stack: string }> = [];
    for (const remote of remotes) {
      try {
        if (!remote.url) {
          const errorMsg = `Remote ${remote.remote} has no URL configured`;
          pushErrors.push({ remote: remote.remote, url: 'N/A', error: errorMsg, code: 'NO_URL', stack: '' });
          skippedRemotes.push(remote.remote);
          continue;
        }
        const authCallback = getAuthCallback(remote.url);
        await git.push({ dir, url: remote.url, ref: effectiveTargetBranch, force: true, ...(authCallback && { onAuth: authCallback }) });
        pushedRemotes.push(remote.remote);
      } catch (pushError: any) {
        const errorMsg = pushError instanceof Error ? pushError.message : String(pushError);
        pushErrors.push({ remote: remote.remote, url: remote.url || 'N/A', error: errorMsg, code: pushError?.code || 'UNKNOWN', stack: pushError?.stack || '' });
        skippedRemotes.push(remote.remote);
      }
    }

    progress('Push complete', 100);
    return { success: true, mergeCommitOid, pushedRemotes, skippedRemotes, pushErrors: pushErrors.length ? pushErrors : undefined };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}
