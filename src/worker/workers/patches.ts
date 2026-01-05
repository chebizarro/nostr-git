import type { GitProvider } from '../../git/provider.js';
import type { MergeAnalysisResult } from '../../git/merge-analysis.js';

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
    const effectiveTargetBranch = await resolveRobustBranch(
      dir,
      targetBranch || patchData.baseBranch
    );

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
  const changes: Array<{
    filepath: string;
    type: 'add' | 'modify' | 'delete' | 'unsupported';
    content: string;
  }> = [];
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
        // Push even if no hunks when we flagged unsupported
        changes.push({
          filepath: currentFile,
          type: currentType,
          content: currentContent.join('\n')
        });
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
    if (
      line.startsWith('GIT binary patch') ||
      line.includes('Binary files') ||
      line.includes('binary files')
    ) {
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
      if (!sawUnsupported && currentType !== 'add' && currentType !== 'delete') {
        currentType = isDeletedFile ? 'delete' : isNewFile ? 'add' : 'modify';
      }
      currentContent.push(line);
      continue;
    }
    if (inFileDiff && currentFile) {
      currentContent.push(line);
    }
  }
  if (currentFile && (currentContent.length > 0 || sawUnsupported)) {
    changes.push({ filepath: currentFile, type: currentType, content: currentContent.join('\n') });
  }
  return changes;
}

function extractNewFileContentFromPatch(patchContent: string): string {
  const lines = patchContent.split('\n');
  const contentLines: string[] = [];
  let inContent = false;
  for (const line of lines) {
    if (line.startsWith('@@')) {
      inContent = true;
      continue;
    }
    if (!inContent) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) contentLines.push(line.substring(1));
    else if (!line.startsWith('-') && !line.startsWith('\\'))
      contentLines.push(line.startsWith(' ') ? line.substring(1) : line);
  }
  return contentLines.join('\n');
}

function applyUnifiedDiffPatch(existingContent: string, patchContent: string): string {
  const src = existingContent.split('\n');
  const p = patchContent.split('\n');

  type Hunk = { header: string; lines: string[]; oldStart: number };
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  for (const line of p) {
    const m = line.match(/^@@\s+-?(\d+),?\d*\s+\+(\d+),?\d*\s+@@/);
    if (m) {
      if (current) hunks.push(current);
      current = { header: line, lines: [], oldStart: parseInt(m[1]) - 1 };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) hunks.push(current);

  const out: string[] = [];
  let cursor = 0; // index into src

  const advanceTo = (target: number) => {
    while (cursor < Math.max(0, target) && cursor < src.length) {
      out.push(src[cursor++]);
    }
  };

  const findContextOffset = (startIndex: number, ctx: string[]): number => {
    if (ctx.length === 0) return startIndex;
    const window = 5;
    const begin = Math.max(0, startIndex - window);
    const end = Math.min(src.length - ctx.length, startIndex + window);
    for (let i = begin; i <= end; i++) {
      let ok = true;
      for (let j = 0; j < ctx.length; j++) {
        if (src[i + j] !== ctx[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return startIndex; // fallback
  };

  for (const h of hunks) {
    // Extract first few context lines from the hunk body to help alignment
    const preCtx: string[] = [];
    for (const l of h.lines) {
      if (l.startsWith(' ')) preCtx.push(l.substring(1));
      else if (l.startsWith('+') || l.startsWith('-') || l.startsWith('\\')) break;
      if (preCtx.length >= 3) break;
    }

    const aligned = findContextOffset(h.oldStart, preCtx);
    advanceTo(aligned);

    // Apply hunk
    for (const l of h.lines) {
      if (!l) continue;
      if (l.startsWith(' ')) {
        out.push(l.substring(1));
        cursor++;
      } else if (l.startsWith('+')) {
        out.push(l.substring(1));
      } else if (l.startsWith('-')) {
        cursor++;
      } else if (l.startsWith('\\')) {
        /* ignore no newline markers */
      }
    }
  }

  // Append the remainder
  while (cursor < src.length) out.push(src[cursor++]);
  return out.join('\n');
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
  const {
    rootDir,
    canonicalRepoKey,
    resolveRobustBranch,
    ensureFullClone,
    getAuthCallback,
    getConfiguredAuthHosts,
    getProviderFs
  } = deps;

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
    const unsupported = fileChanges.find((c) => c.type === 'unsupported');
    if (unsupported) {
      return {
        success: false,
        error: 'Unsupported patch features detected (rename/binary). Aborting.'
      };
    }

    for (const change of fileChanges) {
      if (change.type === 'modify' || change.type === 'add') {
        const fullPath = `${dir}/${change.filepath}`;
        const pathParts = change.filepath.split('/');
        if (pathParts.length > 1) {
          const dirPath = pathParts.slice(0, -1).join('/');
          const fullDirPath = `${dir}/${dirPath}`;
          try {
            await fs.promises.mkdir(fullDirPath, { recursive: true });
          } catch {}
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
      const hasChanges =
        Array.isArray(status) &&
        status.some((row: any[]) => {
          // isomorphic-git statusMatrix: [filepath, head, workdir, stage]
          const head = row?.[1];
          const workdir = row?.[2];
          const stage = row?.[3];
          // Any difference between head and workdir or anything staged indicates changes
          return head !== workdir || stage !== 0;
        });
      if (!hasChanges) {
        return {
          success: false,
          error: 'No changes to apply - patch may already be merged or invalid'
        };
      }
      progress('Changes staged', 70);
    } catch {
      // If statusMatrix is unavailable, proceed to commit (best-effort)
      progress('Proceeding without status validation', 70);
    }

    // Create merge commit
    const defaultMessage = `Merge patch: ${patchData.id.slice(0, 8)}`;
    const commitMessage = mergeCommitMessage || defaultMessage;
    const mergeCommitOid = await git.commit({
      dir,
      message: commitMessage,
      author: { name: authorName, email: authorEmail }
    });
    progress('Merge commit created', 80);

    // Push to remotes
    const remotes = await git.listRemotes({ dir });
    const pushedRemotes: string[] = [];
    const skippedRemotes: string[] = [];
    if (remotes.length === 0) {
      return {
        success: true,
        mergeCommitOid,
        pushedRemotes: [],
        skippedRemotes: [],
        warning: 'No remotes configured - changes only applied locally'
      };
    }

    const pushErrors: Array<{
      remote: string;
      url: string;
      error: string;
      code: string;
      stack: string;
    }> = [];
    for (const remote of remotes) {
      try {
        if (!remote.url) {
          const errorMsg = `Remote ${remote.remote} has no URL configured`;
          pushErrors.push({
            remote: remote.remote,
            url: 'N/A',
            error: errorMsg,
            code: 'NO_URL',
            stack: ''
          });
          skippedRemotes.push(remote.remote);
          continue;
        }
        // Use tryPushWithTokens for fallback retry logic with multiple tokens
        const { tryPushWithTokens } = await import('./auth.js');
        await tryPushWithTokens(remote.url, async (authCallback) => {
          await git.push({
            dir,
            url: remote.url,
            ref: effectiveTargetBranch,
            force: true,
            ...(authCallback && { onAuth: authCallback })
          });
        });
        pushedRemotes.push(remote.remote);
      } catch (pushError: any) {
        // If push to protected branch is rejected by a pre-receive hook, retry to a topic branch
        const rawMsg =
          pushError instanceof Error ? pushError.message || '' : String(pushError || '');
        const code = (pushError && (pushError.code || pushError.name)) || 'UNKNOWN';
        const looksProtected =
          /pre-receive hook declined/i.test(rawMsg) || /protected branch/i.test(rawMsg);
        const graspLike = /relay\.ngit\.dev|grasp/i.test(remote.url || '');

        if (looksProtected || graspLike) {
          try {
            const shortId = (patchData.id || 'patch').slice(0, 8);
            const topicBranch = `grasp/patch-${shortId}`;
            const remoteRef = `refs/heads/${topicBranch}`;
            // Use tryPushWithTokens for fallback retry logic with multiple tokens
            const { tryPushWithTokens } = await import('./auth.js');
            // Push local target branch to remote topic branch; avoid force on fallback
            await tryPushWithTokens(remote.url || '', async (authCallback) => {
              await git.push({
                dir,
                url: remote.url as string,
                ref: effectiveTargetBranch,
                remoteRef,
                force: false,
                ...(authCallback && { onAuth: authCallback })
              } as any);
            });
            pushedRemotes.push(`${remote.remote}:${topicBranch}`);
            // Record the original failure as a warning rather than fatal
            pushErrors.push({
              remote: remote.remote,
              url: remote.url || 'N/A',
              error: `Primary push rejected (${code}). Fallback pushed to ${topicBranch}. Original: ${rawMsg}`,
              code: 'FALLBACK_TOPIC_PUSH',
              stack: ''
            });
            continue;
          } catch (fallbackErr: any) {
            const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            pushErrors.push({
              remote: remote.remote,
              url: remote.url || 'N/A',
              error: fbMsg,
              code: fallbackErr?.code || 'FALLBACK_FAILED',
              stack: fallbackErr?.stack || ''
            });
            skippedRemotes.push(remote.remote);
            continue;
          }
        }

        // Non-protection-related error, report as-is
        const errorMsg = rawMsg;
        pushErrors.push({
          remote: remote.remote,
          url: remote.url || 'N/A',
          error: errorMsg,
          code,
          stack: pushError?.stack || ''
        });
        skippedRemotes.push(remote.remote);
      }
    }

    progress('Push complete', 100);
    // Aggregate warning if any fallback behavior occurred
    const hadFallback = (pushErrors || []).some((e) => e.code === 'FALLBACK_TOPIC_PUSH');
    const warning = hadFallback
      ? 'Primary push rejected by remote policy; patch was pushed to a topic branch for review.'
      : undefined;
    return {
      success: true,
      mergeCommitOid,
      pushedRemotes,
      skippedRemotes,
      warning,
      pushErrors: pushErrors.length ? pushErrors : undefined
    };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}
