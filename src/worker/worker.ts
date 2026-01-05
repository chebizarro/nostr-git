import { expose } from "comlink";

import type { GitProvider } from "../git/provider.js";
import { getGitProvider } from "../git/factory.js";
import { rootDir } from "../git/git.js";
import { analyzePatchMergeability } from "../git/merge-analysis.js";

import type { EventIO } from "../types/index.js";
import { getNostrGitProvider, initializeNostrGitProvider } from "../api/git-provider.js";

import { canonicalRepoKey } from "../utils/canonicalRepoKey.js";

import type { AuthConfig } from "./workers/auth.js";
import { getAuthCallback, getConfiguredAuthHosts, setAuthConfig } from "./workers/auth.js";

import { resolveRobustBranch as resolveRobustBranchUtil } from "./workers/branches.js";
import { getProviderFs, isRepoClonedFs } from "./workers/fs-utils.js";

import type { RepoCache } from "./workers/cache.js";
import { RepoCacheManager } from "./workers/cache.js";

import type { CloneRemoteRepoOptions } from "./workers/repos.js";
import {
  clearCloneTracking,
  cloneRemoteRepoUtil,
  ensureFullCloneUtil,
  ensureShallowCloneUtil,
  initializeRepoUtil,
  smartInitializeRepoUtil,
} from "./workers/repos.js";

import { needsUpdateUtil, syncWithRemoteUtil } from "./workers/sync.js";

import type { AnalyzePatchMergeOptions, ApplyPatchAndPushOptions } from "./workers/patches.js";
import { analyzePatchMergeUtil, applyPatchAndPushUtil } from "./workers/patches.js";

import type { SafePushOptions } from "./workers/push.js";
import { safePushToRemoteUtil } from "./workers/push.js";

type DataLevel = "refs" | "shallow" | "full";

function toPlain<T>(val: T): T {
  try {
    return JSON.parse(JSON.stringify(val));
  } catch {
    return val;
  }
}

function postProgress(payload: {
  type: "clone-progress" | "merge-progress";
  repoId: string;
  phase: string;
  loaded?: number;
  total?: number;
  progress?: number;
}) {
  try {
    (self as any).postMessage(payload);
  } catch {
    // ignore (some hosts may not listen)
  }
}

function makeProgress(repoId: string, type: "clone-progress" | "merge-progress") {
  return (phase: string, loaded?: number, total?: number) => {
    postProgress({ type, repoId, phase, loaded, total });
  };
}

function repoKeyAndDir(repoId: string): { key: string; dir: string } {
  const key = canonicalRepoKey(repoId);
  return { key, dir: `${rootDir}/${key}` };
}

async function isShallowClone(repoDir: string, git: GitProvider): Promise<boolean> {
  const fs: any = getProviderFs(git);
  if (!fs?.promises?.stat) return false;
  try {
    await fs.promises.stat(`${repoDir}/.git/shallow`);
    return true;
  } catch {
    return false;
  }
}

async function hasUncommittedChanges(repoDir: string, git: GitProvider): Promise<boolean> {
  try {
    const matrix: Array<[string, number, number, number]> = await (git as any).statusMatrix({
      dir: repoDir,
    });
    for (const row of matrix) {
      const head = row[1];
      const workdir = row[2];
      const stage = row[3];
      if (workdir !== head || stage !== head) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// --- shared worker state ---
const git: GitProvider = getGitProvider();
const cacheManager: RepoCacheManager = new (RepoCacheManager as any)();
const clonedRepos = new Set<string>();
const repoDataLevels = new Map<string, DataLevel>();
let eventIO: EventIO | null = null;

// --- exposed Comlink API ---
const api = {
  // Configuration
  async setEventIO(io: EventIO): Promise<void> {
    eventIO = io;
    // Wire EventIO into the higher-level NostrGitProvider system
    // (EventIO handles signing internally; worker just stores proxy and delegates)
    initializeNostrGitProvider({ eventIO: io });
  },

  async setAuthConfig(cfg: AuthConfig): Promise<void> {
    setAuthConfig(cfg);
  },

  getConfiguredAuthHosts(): string[] {
    return getConfiguredAuthHosts();
  },

  // Repo tracking management
  clearCloneTracking(): void {
    clearCloneTracking(clonedRepos, repoDataLevels);
  },

  // Core repo initialization
  async initializeRepo(opts: { repoId: string; cloneUrls: string[] }) {
    const { repoId } = opts;
    const sendProgress = makeProgress(repoId, "clone-progress");
    return toPlain(
      await initializeRepoUtil(
        git,
        cacheManager,
        opts,
        {
          rootDir,
          canonicalRepoKey,
          repoDataLevels,
          clonedRepos,
        },
        sendProgress
      )
    );
  },

  async smartInitializeRepo(opts: { repoId: string; cloneUrls: string[]; forceUpdate?: boolean }) {
    const { repoId } = opts;
    const sendProgress = makeProgress(repoId, "clone-progress");
    return toPlain(
      await smartInitializeRepoUtil(
        git,
        cacheManager,
        opts,
        {
          rootDir,
          canonicalRepoKey,
          repoDataLevels,
          clonedRepos,
          isRepoCloned: async (g: GitProvider, dir: string) => isRepoClonedFs(g, dir),
          resolveRobustBranch: async (g: GitProvider, dir: string, requested?: string) =>
            resolveRobustBranchUtil(g, dir, requested),
        },
        sendProgress
      )
    );
  },

  async ensureShallowClone(opts: { repoId: string; branch?: string }) {
    const { repoId } = opts;
    const sendProgress = makeProgress(repoId, "clone-progress");
    return toPlain(
      await ensureShallowCloneUtil(
        git,
        opts,
        {
          rootDir,
          canonicalRepoKey,
          repoDataLevels,
          clonedRepos,
          isRepoCloned: async (g: GitProvider, dir: string) => isRepoClonedFs(g, dir),
          resolveRobustBranch: async (g: GitProvider, dir: string, requested?: string) =>
            resolveRobustBranchUtil(g, dir, requested),
        },
        sendProgress
      )
    );
  },

  async ensureFullClone(opts: { repoId: string; branch?: string; depth?: number }) {
    const { repoId } = opts;
    const sendProgress = makeProgress(repoId, "clone-progress");
    return toPlain(
      await ensureFullCloneUtil(
        git,
        opts,
        {
          rootDir,
          canonicalRepoKey,
          repoDataLevels,
          clonedRepos,
          isRepoCloned: async (g: GitProvider, dir: string) => isRepoClonedFs(g, dir),
          resolveRobustBranch: async (g: GitProvider, dir: string, requested?: string) =>
            resolveRobustBranchUtil(g, dir, requested),
        },
        sendProgress
      )
    );
  },

  async cloneRemoteRepo(options: CloneRemoteRepoOptions): Promise<void> {
    // This util handles cleanup and cache writes internally
    await cloneRemoteRepoUtil(git, cacheManager, options);
  },

  // Sync helpers
  async syncWithRemote(opts: { repoId: string; cloneUrls: string[]; branch?: string }) {
    return toPlain(
      await syncWithRemoteUtil(git, cacheManager, opts, {
        rootDir,
        canonicalRepoKey,
        resolveRobustBranch: async (dir: string, requested?: string) =>
          resolveRobustBranchUtil(git, dir, requested),
        isRepoCloned: async (dir: string) => isRepoClonedFs(git, dir),
        toPlain,
      })
    );
  },

  async needsUpdate(opts: { repoId: string; cloneUrls: string[]; now?: number }): Promise<boolean> {
    const { repoId, cloneUrls, now } = opts;
    const { key } = repoKeyAndDir(repoId);
    let cache: RepoCache | null = null;
    try {
      cache = await (cacheManager as any).getRepoCache(key);
    } catch {
      cache = null;
    }
    return await needsUpdateUtil(git, key, cloneUrls, cache, now ?? Date.now());
  },

  // Patch analysis & application
  async analyzePatchMerge(opts: AnalyzePatchMergeOptions) {
    const { repoId } = opts;
    const sendProgress = makeProgress(repoId, "merge-progress");
    sendProgress("Analyzing patch mergeability...");
    const result = await analyzePatchMergeUtil(git, opts, {
      rootDir,
      canonicalRepoKey,
      resolveRobustBranch: async (dir: string, requested?: string) =>
        resolveRobustBranchUtil(git, dir, requested),
      analyzePatchMergeability,
    });
    sendProgress("Analysis complete");
    return toPlain(result);
  },

  async applyPatchAndPush(opts: ApplyPatchAndPushOptions) {
    const { repoId } = opts;
    const sendProgress = makeProgress(repoId, "merge-progress");
    sendProgress("Applying patch...");
    const result = await applyPatchAndPushUtil(git, opts, {
      rootDir,
      canonicalRepoKey,
      resolveRobustBranch: async (dir: string, requested?: string) =>
        resolveRobustBranchUtil(git, dir, requested),
      ensureFullClone: async (args: { repoId: string; branch?: string; depth?: number }) =>
        ensureFullCloneUtil(
          git,
          args,
          {
            rootDir,
            canonicalRepoKey,
            repoDataLevels,
            clonedRepos,
            isRepoCloned: async (g: GitProvider, dir: string) => isRepoClonedFs(g, dir),
            resolveRobustBranch: async (g: GitProvider, dir: string, requested?: string) =>
              resolveRobustBranchUtil(g, dir, requested),
          },
          makeProgress(args.repoId, "clone-progress")
        ),
      getAuthCallback,
      getConfiguredAuthHosts,
      getProviderFs: (g: GitProvider) => getProviderFs(g),
    });
    sendProgress("Apply complete");
    return toPlain(result);
  },

  async pushToRemote(opts: {
    repoId: string;
    remoteUrl: string;
    branch?: string;
    token?: string;
    provider?: string;
    blossomMirror?: boolean;
  }) {
    const { repoId, remoteUrl, branch, token, provider, blossomMirror } = opts;
    const { dir } = repoKeyAndDir(repoId);
    const targetBranch = branch || "main";

    const onAuth =
      token != null
        ? () => ({ username: "token", password: token })
        : getAuthCallback(remoteUrl);

    const nostrProvider = getNostrGitProvider?.();
    if (nostrProvider) {
      const result = await nostrProvider.push({
        dir,
        fs: getProviderFs(git),
        ref: targetBranch,
        remoteRef: targetBranch,
        url: remoteUrl,
        onAuth,
        blossomMirror: blossomMirror ?? Boolean(provider === "blossom" || provider === "grasp"),
      });
      return toPlain({
        success: true,
        branch: targetBranch,
        remoteUrl,
        blossomSummary: result.blossomSummary,
      });
    }

    await (git as any).push({
      dir,
      url: remoteUrl,
      ref: targetBranch,
      remoteRef: targetBranch,
      onAuth,
    });

    return toPlain({ success: true, branch: targetBranch, remoteUrl });
  },

  // Safe push wrapper (preflight checks + optional confirmation flow)
  async safePushToRemote(opts: SafePushOptions) {
    return toPlain(
      await safePushToRemoteUtil(git, cacheManager, opts, {
        rootDir,
        canonicalRepoKey,
        isRepoCloned: async (dir: string) => isRepoClonedFs(git, dir),
        isShallowClone: async (key: string) => {
          const { dir } = repoKeyAndDir(key);
          return await isShallowClone(dir, git);
        },
        resolveRobustBranch: async (dir: string, requested?: string) =>
          resolveRobustBranchUtil(git, dir, requested),
        hasUncommittedChanges: async (dir: string) => hasUncommittedChanges(dir, git),
        needsUpdate: async (repoId: string, cloneUrls: string[], cache: RepoCache | null) =>
          needsUpdateUtil(git, repoId, cloneUrls, cache, Date.now()),
        pushToRemote: async (args: {
          repoId: string;
          remoteUrl: string;
          branch?: string;
          token?: string;
          provider?: any;
        }) => {
          try {
            return await api.pushToRemote({
              repoId: args.repoId,
              remoteUrl: args.remoteUrl,
              branch: args.branch,
              token: args.token,
              provider: args.provider,
            });
          } catch (e: any) {
            return { success: false, error: e?.message || String(e) } as any;
          }
        },
      })
    );
  },

  // Convenience repo ops (useful for UIs)
  async listBranches(opts: { repoId: string }): Promise<string[]> {
    const { dir } = repoKeyAndDir(opts.repoId);
    return toPlain(await (git as any).listBranches({ dir }));
  },

  async resolveBranch(opts: { repoId: string; branch?: string }): Promise<string> {
    const { dir } = repoKeyAndDir(opts.repoId);
    return await resolveRobustBranchUtil(git, dir, opts.branch);
  },

  async getCommitHistory(opts: { repoId: string; branch?: string; depth?: number }) {
    const { dir } = repoKeyAndDir(opts.repoId);
    const ref = opts.branch || "main";
    const depth = opts.depth ?? 50;
    const commits = await (git as any).log({ dir, ref, depth });
    return toPlain(commits);
  },
};

expose(api);
