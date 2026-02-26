import type { GitProvider } from "../../git/provider.js";
import type { GitMergeResult } from "../../git/provider.js";
import type { PRMergeAnalysisResult } from "../../git/merge-analysis.js";
import { analyzePRMergeability } from "../../git/merge-analysis.js";
import { withUrlFallback, filterValidCloneUrls } from "../../utils/clone-url-fallback.js";
import { resolveDefaultCorsProxy } from "./git-config.js";

export interface AnalyzePRMergeOptions {
  repoId: string;
  prCloneUrls: string[];
  /** Clone URLs from repo (base) - for fetching target branch */
  targetCloneUrls?: string[];
  tipCommitOid: string;
  targetBranch?: string;
  allCommitOids?: string[];
}

export interface MergePRAndPushOptions {
  repoId: string;
  cloneUrls: string[];
  tipCommitOid: string;
  targetBranch?: string;
  mergeCommitMessage?: string;
  fastForward?: boolean;
  onProgress?: (step: string, progress: number) => void;
}

export interface MergePRAndPushResult {
  success: boolean;
  error?: string;
  mergeCommitOid?: string;
  pushedRemotes?: string[];
  skippedRemotes?: string[];
  warning?: string;
  pushErrors?: Array<{ remote: string; url: string; error: string; code: string; stack: string }>;
}

export async function mergePRAndPushUtil(
  git: GitProvider,
  opts: MergePRAndPushOptions,
  deps: {
    rootDir: string;
    parseRepoId: (id: string) => string;
    resolveBranchName: (dir: string, requested?: string) => Promise<string>;
    ensureFullClone: (args: {
      repoId: string;
      branch?: string;
      depth?: number;
      cloneUrls?: string[];
    }) => Promise<any>;
    getAuthCallback: (url: string) => any;
    getConfiguredAuthHosts?: () => string[];
  }
): Promise<MergePRAndPushResult> {
  const {
    repoId,
    cloneUrls,
    tipCommitOid,
    targetBranch,
    mergeCommitMessage,
    fastForward = true,
    onProgress = () => {},
  } = opts;

  const { rootDir, parseRepoId, resolveBranchName, ensureFullClone } = deps;
  let usedTempRef = false;
  let prTipRef: string | null = null;
  const key = parseRepoId(repoId);
  const dir = `${rootDir}/${key}`;

  try {

    onProgress("Resolving target branch...", 5);
    const effectiveTargetBranch = await resolveBranchName(dir, targetBranch || "main");

    onProgress("Ensuring repository is ready...", 10);
    await ensureFullClone({ repoId, branch: effectiveTargetBranch });

    const validUrls = filterValidCloneUrls(cloneUrls);
    if (validUrls.length === 0) {
      return {
        success: false,
        error: "No valid clone URLs in PR",
      };
    }

    const prRemote = `pr-source-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

    const fetchResult = await withUrlFallback(
      validUrls,
      async (url: string) => {
        try {
          await git.addRemote({ dir, remote: prRemote, url });
          try {
            await git.setConfig({
              dir,
              path: `remote.${prRemote}.fetch`,
              value: `+refs/heads/*:refs/remotes/${prRemote}/*`,
            });
          } catch {
            /* ignore */
          }

          onProgress("Fetching PR branch...", 20);
          await git.fetch({
            dir,
            remote: prRemote,
            url,
            singleBranch: false,
            depth: 100,
          });

          const tipOid = tipCommitOid;
          return { prTipRef: undefined, tipOid };
        } finally {
          try {
            await git.deleteRemote({ dir, remote: prRemote });
          } catch {
            /* ignore */
          }
        }
      },
      { perUrlTimeoutMs: 20000 }
    );

    if (!fetchResult.success || !fetchResult.result) {
      const errMsg = fetchResult.attempts?.length
        ? fetchResult.attempts.map((a) => `${a.url}: ${a.error || "failed"}`).join("; ")
        : "Failed to fetch PR from any clone URL";
      return { success: false, error: errMsg };
    }

    const { prTipRef: fetchedPrTipRef, tipOid } = fetchResult.result;
    // When we fetched all (no source branch), write tip to temp ref for merge
    usedTempRef = !fetchedPrTipRef;
    prTipRef = fetchedPrTipRef ?? "refs/pr-tip-merge";
    if (usedTempRef) {
      await git.writeRef({ dir, ref: prTipRef, value: tipOid, force: true });
    }

    onProgress("Checking out target branch...", 40);
    await git.checkout({ dir, ref: effectiveTargetBranch });

    onProgress("Merging PR...", 50);
    const mergeResult = (await git.merge({
        dir,
        ours: effectiveTargetBranch,
        theirs: prTipRef,
        fastForward,
        abortOnConflict: true,
        message: mergeCommitMessage || `Merge PR (${tipCommitOid.slice(0, 8)})`,
        author: { name: "Repository Maintainer", email: "maintainer@nostr-git.local" },
      } as any)) as GitMergeResult;

    const mergeCommitOid = mergeResult?.oid;
    if (!mergeCommitOid) {
      return {
        success: false,
        error: "Merge completed but no commit OID returned",
      };
    }

    onProgress("Pushing to remotes...", 70);

    const remotes = await git.listRemotes({ dir });
    const pushedRemotes: string[] = [];
    const skippedRemotes: string[] = [];
    const pushErrors: Array<{
        remote: string;
        url: string;
        error: string;
        code: string;
        stack: string;
    }> = [];

    if (remotes.length === 0) {
      return {
        success: true,
        mergeCommitOid,
        pushedRemotes: [],
        skippedRemotes: [],
        warning: "No remotes configured - changes only applied locally",
      };
    }

    const { tryPushWithTokens } = await import("./auth.js");
    const corsProxy = resolveDefaultCorsProxy();

    for (const remote of remotes) {
      try {
        if (!remote.url) {
          pushErrors.push({
            remote: remote.remote,
            url: "N/A",
            error: `Remote ${remote.remote} has no URL configured`,
            code: "NO_URL",
            stack: "",
          });
          skippedRemotes.push(remote.remote);
          continue;
        }
        await tryPushWithTokens(remote.url, async (authCallback) => {
          await git.push({
            dir,
            url: remote.url,
            ref: effectiveTargetBranch,
            force: true,
            corsProxy: corsProxy ?? undefined,
            ...(authCallback && { onAuth: authCallback }),
          });
        });
        pushedRemotes.push(remote.remote);
      } catch (pushError: any) {
        const rawMsg =
          pushError instanceof Error ? pushError.message || "" : String(pushError || "");
        const code = (pushError?.code || pushError?.name || "UNKNOWN") as string;
        const looksProtected =
          /pre-receive hook declined/i.test(rawMsg) || /protected branch/i.test(rawMsg);
        const graspLike = /relay\.ngit\.dev|grasp/i.test(remote.url || "");

        if (looksProtected || graspLike) {
          try {
            const topicBranch = `grasp/pr-${tipCommitOid.slice(0, 8)}`;
            await tryPushWithTokens(remote.url || "", async (authCallback) => {
              await git.push({
                dir,
                url: remote.url as string,
                ref: effectiveTargetBranch,
                remoteRef: `refs/heads/${topicBranch}`,
                force: false,
                corsProxy: corsProxy ?? undefined,
                ...(authCallback && { onAuth: authCallback }),
              } as any);
            });
            pushedRemotes.push(`${remote.remote}:${topicBranch}`);
            pushErrors.push({
              remote: remote.remote,
              url: remote.url || "N/A",
              error: `Primary push rejected. Fallback pushed to ${topicBranch}. Original: ${rawMsg}`,
              code: "FALLBACK_TOPIC_PUSH",
              stack: "",
            });
            continue;
          } catch (fallbackErr: any) {
            pushErrors.push({
              remote: remote.remote,
              url: remote.url || "N/A",
              error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
              code: fallbackErr?.code || "FALLBACK_FAILED",
              stack: fallbackErr?.stack || "",
            });
            skippedRemotes.push(remote.remote);
            continue;
          }
        }

        pushErrors.push({
          remote: remote.remote,
          url: remote.url || "N/A",
          error: rawMsg,
          code,
          stack: pushError?.stack || "",
        });
        skippedRemotes.push(remote.remote);
      }
    }

    onProgress("Merge complete", 100);

    const hadFallback = pushErrors.some((e) => e.code === "FALLBACK_TOPIC_PUSH");
    const warning = hadFallback
      ? "Primary push rejected by remote policy; PR was pushed to a topic branch for review."
      : undefined;

    // If we had remotes to push to but none succeeded, treat as failure
    if (remotes.length > 0 && pushedRemotes.length === 0) {
      const firstError = pushErrors[0];
      const errorMsg = firstError
        ? `Push to ${firstError.remote} failed: ${firstError.error}`
        : "Push to all remotes failed";
      return {
        success: false,
        error: errorMsg,
        mergeCommitOid,
        pushedRemotes,
        skippedRemotes,
        warning,
        pushErrors: pushErrors.length ? pushErrors : undefined,
      };
    }

    return {
      success: true,
      mergeCommitOid,
      pushedRemotes,
      skippedRemotes,
      warning,
      pushErrors: pushErrors.length ? pushErrors : undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || String(error),
    };
  } finally {
    if (usedTempRef && prTipRef) {
      try {
        await git.deleteRef({ dir, ref: prTipRef });
      } catch {
        /* ignore */
      }
    }
  }
}

export async function analyzePRMergeUtil(
  git: GitProvider,
  opts: AnalyzePRMergeOptions,
  deps: {
    rootDir: string;
    parseRepoId: (id: string) => string;
    resolveBranchName: (dir: string, requested?: string) => Promise<string>;
  }
): Promise<PRMergeAnalysisResult> {
  const { repoId, prCloneUrls, targetCloneUrls, tipCommitOid, targetBranch, allCommitOids } = opts;
  const { rootDir, parseRepoId, resolveBranchName } = deps;

  const key = parseRepoId(repoId);
  const dir = `${rootDir}/${key}`;

  // Pass target branch directly; analyzePRMergeability will fetch it if not present
  const effectiveTargetBranch = targetBranch || "main";

  const result = await analyzePRMergeability(git, dir, {
    cloneUrls: prCloneUrls,
    targetCloneUrls,
    tipCommitOid,
    targetBranch: effectiveTargetBranch,
    allCommitOids,
  });

  return result;
}
