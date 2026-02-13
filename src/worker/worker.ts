// Crypto polyfill for worker context where crypto.subtle may be unavailable
// Must be at the very top before any other imports that might use crypto
// In insecure contexts (HTTP), crypto.subtle exists but operations fail
;(function initWorkerCryptoPolyfill() {
  const globalScope: any = typeof self !== "undefined" ? self : globalThis

  // Always install polyfill in insecure contexts (HTTP) where crypto.subtle won't work
  const isInsecure =
    typeof globalScope.isSecureContext !== "undefined" && !globalScope.isSecureContext
  const needsPolyfill = !globalScope.crypto?.subtle?.digest || isInsecure

  if (needsPolyfill) {
    console.warn(
      "[Worker] Installing crypto.subtle polyfill (insecure context or missing crypto.subtle)",
    )

    // SHA-256 implementation
    function sha256(data: Uint8Array): Uint8Array {
      const K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
      ])
      const H = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
      ])

      const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n))
      const ch = (x: number, y: number, z: number) => (x & y) ^ (~x & z)
      const maj = (x: number, y: number, z: number) => (x & y) ^ (x & z) ^ (y & z)
      const sigma0 = (x: number) => rotr(2, x) ^ rotr(13, x) ^ rotr(22, x)
      const sigma1 = (x: number) => rotr(6, x) ^ rotr(11, x) ^ rotr(25, x)
      const gamma0 = (x: number) => rotr(7, x) ^ rotr(18, x) ^ (x >>> 3)
      const gamma1 = (x: number) => rotr(17, x) ^ rotr(19, x) ^ (x >>> 10)

      // Padding
      const bitLen = data.length * 8
      const padLen = (data.length % 64 < 56 ? 56 : 120) - (data.length % 64)
      const padded = new Uint8Array(data.length + padLen + 8)
      padded.set(data)
      padded[data.length] = 0x80
      const view = new DataView(padded.buffer)
      view.setUint32(padded.length - 4, bitLen, false)

      // Process blocks
      const h = new Uint32Array(H)
      const w = new Uint32Array(64)
      for (let i = 0; i < padded.length; i += 64) {
        for (let j = 0; j < 16; j++) {
          w[j] = view.getUint32(i + j * 4, false)
        }
        for (let j = 16; j < 64; j++) {
          w[j] = (gamma1(w[j - 2]) + w[j - 7] + gamma0(w[j - 15]) + w[j - 16]) >>> 0
        }
        let [a, b, c, d, e, f, g, hh] = h
        for (let j = 0; j < 64; j++) {
          const t1 = (hh + sigma1(e) + ch(e, f, g) + K[j] + w[j]) >>> 0
          const t2 = (sigma0(a) + maj(a, b, c)) >>> 0
          hh = g
          g = f
          f = e
          e = (d + t1) >>> 0
          d = c
          c = b
          b = a
          a = (t1 + t2) >>> 0
        }
        h[0] = (h[0] + a) >>> 0
        h[1] = (h[1] + b) >>> 0
        h[2] = (h[2] + c) >>> 0
        h[3] = (h[3] + d) >>> 0
        h[4] = (h[4] + e) >>> 0
        h[5] = (h[5] + f) >>> 0
        h[6] = (h[6] + g) >>> 0
        h[7] = (h[7] + hh) >>> 0
      }
      const result = new Uint8Array(32)
      const resultView = new DataView(result.buffer)
      for (let i = 0; i < 8; i++) resultView.setUint32(i * 4, h[i], false)
      return result
    }

    const polyfillSubtle = {
      digest: async (algorithm: string, data: BufferSource): Promise<ArrayBuffer> => {
        const algo = algorithm.toLowerCase().replace("-", "")
        if (algo !== "sha256") throw new Error(`Unsupported algorithm: ${algorithm}`)
        const input =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(
                (data as ArrayBufferView).buffer,
                (data as ArrayBufferView).byteOffset,
                (data as ArrayBufferView).byteLength,
              )
        const result = sha256(input)
        // Copy to a new ArrayBuffer to avoid SharedArrayBuffer issues
        const output = new ArrayBuffer(result.length)
        new Uint8Array(output).set(result)
        return output
      },
    }

    if (!globalScope.crypto) globalScope.crypto = {}
    globalScope.crypto.subtle = polyfillSubtle
    console.log("[Worker] crypto.subtle polyfill installed successfully")
  }
})()

import {expose} from "comlink"
import httpWeb from "isomorphic-git/http/web"

import type {GitProvider} from "../git/provider.js"
import {createGitProvider} from "../git/factory-browser.js"
import {rootDir} from "../git/git.js"
import {analyzePatchMergeability} from "../git/merge-analysis.js"

import {
  wrapError,
  isGitError,
  type GitError,
  type GitErrorContext,
  GitErrorCode,
  GitErrorCategory,
} from "../errors/index.js"

import type {EventIO} from "../types/index.js"
import {
  getNostrGitProvider,
  initializeNostrGitProvider,
  hasNostrGitProvider,
} from "../api/git-provider.js"

import {parseRepoId} from "../utils/repo-id.js"

import type {AuthConfig} from "./workers/auth.js"
import {getAuthCallback, getConfiguredAuthHosts, setAuthConfig} from "./workers/auth.js"
import type {GitWorkerConfig} from "./workers/git-config.js"
import {applyGitConfigToProvider, setGitConfig as setWorkerGitConfig} from "./workers/git-config.js"

// Import event-based git operations
import {
  listRepoFilesFromEvent,
  getRepoFileContentFromEvent,
  fileExistsAtCommit,
  getFileHistory,
} from "../git/files.js"
import {listBranchesFromEvent} from "../git/branches.js"
import type {RepoAnnouncementEvent} from "../events/index.js"
import {createRepoStateEvent} from "../events/index.js"

import {resolveBranchName as resolveRobustBranchUtil} from "./workers/branches.js"
import {getProviderFs, isRepoClonedFs} from "./workers/fs-utils.js"

import type {RepoCache} from "./workers/cache.js"
import {RepoCacheManager} from "./workers/cache.js"

import type {CloneRemoteRepoOptions} from "./workers/repos.js"
import {
  clearCloneTracking,
  cloneRemoteRepoUtil,
  ensureFullCloneUtil,
  ensureShallowCloneUtil,
  initializeRepoUtil,
  smartInitializeRepoUtil,
} from "./workers/repos.js"

import {needsUpdateUtil, syncWithRemoteUtil} from "./workers/sync.js"

import type {AnalyzePatchMergeOptions, ApplyPatchAndPushOptions} from "./workers/patches.js"
import {analyzePatchMergeUtil, applyPatchAndPushUtil} from "./workers/patches.js"

import type {SafePushOptions} from "./workers/push.js"
import {safePushToRemoteUtil} from "./workers/push.js"

import {
  getGitignoreTemplate,
  getLicenseTemplate,
  createLocalRepo,
  createRemoteRepo,
  forkAndCloneRepo,
  updateRemoteRepoMetadata,
  updateAndPushFiles,
  type CreateLocalRepoOptions,
  type CreateRemoteRepoOptions,
  type ForkAndCloneOptions,
  type UpdateRemoteRepoMetadataOptions,
  type UpdateAndPushFilesOptions,
} from "./workers/repo-management.js"

type DataLevel = "refs" | "shallow" | "full"

function toPlain<T>(val: T): T {
  try {
    return JSON.parse(JSON.stringify(val))
  } catch {
    return val
  }
}

/**
 * Format an error into a structured response object.
 * Uses the error taxonomy to provide code, category, and hint.
 */
function formatError(
  error: unknown,
  context?: GitErrorContext,
): {
  error: string
  code: GitErrorCode
  category: GitErrorCategory
  hint?: string
  context?: GitErrorContext
} {
  const gitError = isGitError(error) ? error : wrapError(error, context)
  return {
    error: gitError.message,
    code: gitError.code,
    category: gitError.category,
    hint: gitError.hint,
    context: gitError.context,
  }
}

function postProgress(payload: {
  type: "clone-progress" | "merge-progress"
  repoId: string
  phase: string
  loaded?: number
  total?: number
  progress?: number
}) {
  try {
    ;(self as any).postMessage(payload)
  } catch {
    // ignore (some hosts may not listen)
  }
}

function makeProgress(repoId: string, type: "clone-progress" | "merge-progress") {
  return (phase: string, loaded?: number, total?: number) => {
    postProgress({type, repoId, phase, loaded, total})
  }
}

function repoKeyAndDir(repoId: string): {key: string; dir: string} {
  const key = parseRepoId(repoId)
  return {key, dir: `${rootDir}/${key}`}
}

async function isShallowClone(repoDir: string, git: GitProvider): Promise<boolean> {
  const fs: any = getProviderFs(git)
  if (!fs?.promises?.stat) return false
  try {
    await fs.promises.stat(`${repoDir}/.git/shallow`)
    return true
  } catch {
    return false
  }
}

async function hasUncommittedChanges(repoDir: string, git: GitProvider): Promise<boolean> {
  try {
    const matrix: Array<[string, number, number, number]> = await (git as any).statusMatrix({
      dir: repoDir,
    })
    for (const row of matrix) {
      const head = row[1]
      const workdir = row[2]
      const stage = row[3]
      if (workdir !== head || stage !== head) return true
    }
    return false
  } catch {
    return false
  }
}

// --- shared worker state ---
const git: GitProvider = createGitProvider()
applyGitConfigToProvider(git)
const cacheManager: RepoCacheManager = new (RepoCacheManager as any)()
const clonedRepos = new Set<string>()
const repoDataLevels = new Map<string, DataLevel>()
let eventIO: EventIO | null = null

// --- exposed Comlink API ---
const api = {
  // Health check / handshake
  async ping(): Promise<{ok: true; ts: number; apiVersion: string}> {
    return {ok: true, ts: Date.now(), apiVersion: "2026-01-11"}
  },

  // Configuration
  async setEventIO(io: EventIO): Promise<void> {
    eventIO = io
    // Wire EventIO into the higher-level NostrGitProvider system
    // (EventIO handles signing internally; worker just stores proxy and delegates)
    try {
      await initializeNostrGitProvider({eventIO: io})
      console.log("[Worker] NostrGitProvider initialized successfully")
    } catch (err) {
      console.error("[Worker] Failed to initialize NostrGitProvider:", err)
    }
  },

  async setAuthConfig(cfg: AuthConfig): Promise<void> {
    setAuthConfig(cfg)
  },

  async setGitConfig(cfg: GitWorkerConfig): Promise<void> {
    setWorkerGitConfig(cfg, git)
  },

  getConfiguredAuthHosts(): string[] {
    return getConfiguredAuthHosts()
  },

  // Repo tracking management
  clearCloneTracking(): void {
    clearCloneTracking(clonedRepos, repoDataLevels)
  },

  // Core repo initialization
  async initializeRepo(opts: {repoId: string; cloneUrls: string[]}) {
    const {repoId} = opts
    const sendProgress = makeProgress(repoId, "clone-progress")
    return toPlain(
      await initializeRepoUtil(
        git,
        cacheManager,
        opts,
        {
          rootDir,
          parseRepoId,
          repoDataLevels,
          clonedRepos,
        },
        sendProgress,
      ),
    )
  },

  async smartInitializeRepo(opts: {repoId: string; cloneUrls: string[]; forceUpdate?: boolean}) {
    const {repoId} = opts
    const sendProgress = makeProgress(repoId, "clone-progress")
    return toPlain(
      await smartInitializeRepoUtil(
        git,
        cacheManager,
        opts,
        {
          rootDir,
          parseRepoId,
          repoDataLevels,
          clonedRepos,
          isRepoCloned: async (g: GitProvider, dir: string) => isRepoClonedFs(g, dir),
          resolveBranchName: async (dir: string, requested?: string) =>
            resolveRobustBranchUtil(git, dir, requested),
        },
        sendProgress,
      ),
    )
  },

  async ensureShallowClone(opts: {repoId: string; branch?: string}) {
    const {repoId} = opts
    const sendProgress = makeProgress(repoId, "clone-progress")
    return toPlain(
      await ensureShallowCloneUtil(
        git,
        opts,
        {
          rootDir,
          parseRepoId,
          repoDataLevels,
          clonedRepos,
          isRepoCloned: async (g: GitProvider, dir: string) => isRepoClonedFs(g, dir),
          resolveBranchName: async (dir: string, requested?: string) =>
            resolveRobustBranchUtil(git, dir, requested),
        },
        sendProgress,
      ),
    )
  },

  async ensureFullClone(opts: {
    repoId: string
    branch?: string
    depth?: number
    cloneUrls?: string[]
  }) {
    const {repoId} = opts
    const sendProgress = makeProgress(repoId, "clone-progress")
    return toPlain(
      await ensureFullCloneUtil(
        git,
        opts,
        {
          rootDir,
          parseRepoId,
          repoDataLevels,
          clonedRepos,
          isRepoCloned: async (g: GitProvider, dir: string) => isRepoClonedFs(g, dir),
          resolveBranchName: async (dir: string, requested?: string) =>
            resolveRobustBranchUtil(git, dir, requested),
          cacheManager,
        },
        sendProgress,
      ),
    )
  },

  async cloneRemoteRepo(options: CloneRemoteRepoOptions): Promise<void> {
    // This util handles cleanup and cache writes internally
    await cloneRemoteRepoUtil(git, cacheManager, options)
  },

  // Legacy clone function - uses smart initialization strategy
  async clone(opts: {repoId: string; cloneUrls: string[]}) {
    try {
      // Use smart initialization
      const initResult = await api.smartInitializeRepo({
        repoId: opts.repoId,
        cloneUrls: opts.cloneUrls,
      })
      if (!initResult.success) {
        return toPlain(initResult)
      }

      // If we got data from cache and it's already shallow/full, we're done
      const dataLevel = (initResult as any).dataLevel
      if (initResult.fromCache && dataLevel && dataLevel !== "refs") {
        return toPlain(initResult)
      }

      // Otherwise, ensure we have at least shallow clone
      const shallowResult = await api.ensureShallowClone({repoId: opts.repoId})
      if (!shallowResult.success) {
        return toPlain(shallowResult)
      }

      return toPlain({
        success: true,
        repoId: opts.repoId,
        dataLevel: (shallowResult as any).dataLevel,
        fromCache: initResult.fromCache,
      })
    } catch (error: any) {
      console.error(`Clone failed for ${opts.repoId}:`, error)
      return toPlain({
        success: false,
        repoId: opts.repoId,
        ...formatError(error, {naddr: opts.repoId, operation: "clone"}),
      })
    }
  },

  // Clone and fork a repository (legacy function for Nostr fork events)
  async cloneAndFork(opts: {
    sourceUrl: string
    targetHost: "github" | "gitlab" | "gitea"
    targetToken: string
    targetUsername: string
    targetRepo: string
  }) {
    const {sourceUrl, targetHost, targetToken, targetUsername, targetRepo} = opts
    const dir = `${rootDir}/${sourceUrl.replace(/[^a-zA-Z0-9]/g, "_")}`

    try {
      const authCallback = getAuthCallback(sourceUrl)
      await (git as any).clone({
        dir,
        url: sourceUrl,
        singleBranch: true,
        depth: 1,
        ...(authCallback && {onAuth: authCallback}),
      })

      // Create remote repo using the provider factory
      const {getGitServiceApi} = await import("../git/provider-factory.js")
      const api = getGitServiceApi(targetHost, targetToken)
      const repoMetadata = await api.createRepo({
        name: targetRepo,
        description: `Fork of ${sourceUrl}`,
        private: false,
        autoInit: false,
      })

      const remoteUrl = repoMetadata.cloneUrl

      // Push to the new remote
      const remotes = await (git as any).listRemotes({dir})
      const originRemote = remotes.find((r: any) => r.remote === "origin")

      if (originRemote?.url) {
        const resolvedBranch = await resolveRobustBranchUtil(git, dir)
        const pushAuthCallback = getAuthCallback(originRemote.url)
        await (git as any).push({
          dir,
          url: originRemote.url,
          ref: resolvedBranch,
          force: true,
          ...(pushAuthCallback && {onAuth: pushAuthCallback}),
        })
      }

      return toPlain({success: true, remoteUrl})
    } catch (error: any) {
      console.error("cloneAndFork failed:", error)
      return toPlain({
        success: false,
        ...formatError(error, {remote: opts.sourceUrl, operation: "cloneAndFork"}),
      })
    }
  },

  // Check if repo is cloned locally
  async isRepoCloned(opts: {repoId: string}): Promise<boolean> {
    const {dir} = repoKeyAndDir(opts.repoId)
    return await isRepoClonedFs(git, dir)
  },

  // Sync helpers
  async syncWithRemote(opts: {repoId: string; cloneUrls: string[]; branch?: string}) {
    return toPlain(
      await syncWithRemoteUtil(git, cacheManager, opts, {
        rootDir,
        parseRepoId,
        resolveBranchName: async (dir: string, requested?: string) =>
          resolveRobustBranchUtil(git, dir, requested),
        isRepoCloned: async (dir: string) => isRepoClonedFs(git, dir),
        toPlain,
      }),
    )
  },

  async needsUpdate(opts: {repoId: string; cloneUrls: string[]; now?: number}): Promise<boolean> {
    const {repoId, cloneUrls, now} = opts
    const {key} = repoKeyAndDir(repoId)
    let cache: RepoCache | null = null
    try {
      cache = await (cacheManager as any).getRepoCache(key)
    } catch {
      cache = null
    }
    return await needsUpdateUtil(git, key, cloneUrls, cache, now ?? Date.now())
  },

  async listServerRefs(opts: {url: string; prefix?: string; symrefs?: boolean}) {
    try {
      const refs = await git.listServerRefs({
        url: opts.url,
        prefix: opts.prefix,
        symrefs: opts.symrefs ?? true,
        onAuth: getAuthCallback(opts.url),
      })
      return toPlain(refs)
    } catch (error: any) {
      const status = error?.status ?? error?.code ?? error?.data?.status
      const message = String(error?.message ?? error ?? "")
      const isNotFound = status === 404 || message.includes("404") || message.includes("Not Found")
      if (!isNotFound) {
        console.error("[listServerRefs] Error:", error)
      }
      throw error
    }
  },

  // Patch analysis & application
  async analyzePatchMerge(opts: AnalyzePatchMergeOptions) {
    const {repoId} = opts
    const sendProgress = makeProgress(repoId, "merge-progress")
    sendProgress("Analyzing patch mergeability...")
    const result = await analyzePatchMergeUtil(git, opts, {
      rootDir,
      parseRepoId,
      resolveBranchName: async (dir: string, requested?: string) =>
        resolveRobustBranchUtil(git, dir, requested),
      analyzePatchMergeability,
    })
    sendProgress("Analysis complete")
    return toPlain(result)
  },

  async applyPatchAndPush(opts: ApplyPatchAndPushOptions) {
    const {repoId} = opts
    const sendProgress = makeProgress(repoId, "merge-progress")
    sendProgress("Applying patch...")
    const result = await applyPatchAndPushUtil(git, opts, {
      rootDir,
      parseRepoId,
      resolveBranchName: async (dir: string, requested?: string) =>
        resolveRobustBranchUtil(git, dir, requested),
      ensureFullClone: async (args: {
        repoId: string
        branch?: string
        depth?: number
        cloneUrls?: string[]
      }) =>
        ensureFullCloneUtil(
          git,
          args,
          {
            rootDir,
            parseRepoId,
            repoDataLevels,
            clonedRepos,
            isRepoCloned: async (g: GitProvider, dir: string) => isRepoClonedFs(g, dir),
            resolveBranchName: async (dir: string, requested?: string) =>
              resolveRobustBranchUtil(git, dir, requested),
            cacheManager,
          },
          makeProgress(args.repoId, "clone-progress"),
        ),
      getAuthCallback,
      getConfiguredAuthHosts,
      getProviderFs: (g: GitProvider) => getProviderFs(g),
    })
    sendProgress("Apply complete")
    return toPlain(result)
  },

  async pushToRemote(opts: {
    repoId: string
    remoteUrl: string
    branch?: string
    token?: string
    provider?: string
    blossomMirror?: boolean
    /** Pre-signed NIP-98 Authorization headers for GRASP authentication (keyed by URL) */
    authHeaders?: Record<string, string>
    /** @deprecated Use authHeaders instead */
    authHeader?: string
  }) {
    const {repoId, remoteUrl, branch, token, provider, blossomMirror, authHeaders, authHeader} =
      opts
    const {key, dir} = repoKeyAndDir(repoId)
    const targetBranch = branch || "main"

    try {
      console.log(`Pushing repository ${repoId} to remote: ${remoteUrl} (provider=${provider})`)

      // Handle GRASP provider with full state publishing
      if (provider === "grasp") {
        if (!token) {
          throw new Error("GRASP provider requires a pubkey token")
        }

        // Build relay base URL for state publishing
        let relayBaseUrl = remoteUrl
        try {
          const u = new URL(remoteUrl)
          const origin = `${u.protocol}//${u.host}`
          relayBaseUrl = origin.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://")
        } catch {
          relayBaseUrl = remoteUrl
            .replace(/^http:\/\//, "ws://")
            .replace(/^https:\/\//, "wss://")
            .replace(/(ws[s]?:\/\/[^/]+).*/, "$1")
        }

        console.log(`[GRASP] Using relay base URL: ${relayBaseUrl}`)

        // Publish repo state (30618) before pushing
        try {
          const io = eventIO
          const u = new URL(remoteUrl)
          const parts = u.pathname.replace(/^\//, "").split("/")
          const npub = parts[0] || ""
          const repo = (parts[1] || "").replace(/\.git$/, "")

          // Collect local refs
          const heads = await (git as any).listBranches({dir})
          const tags = await (git as any).listTags({dir})
          const refs: Record<string, string> = {}

          for (const b of heads) {
            try {
              const sha = await (git as any).resolveRef({dir, ref: `refs/heads/${b}`})
              refs[`refs/heads/${b}`] = sha
            } catch {}
          }
          for (const t of tags) {
            try {
              const sha = await (git as any).resolveRef({dir, ref: `refs/tags/${t}`})
              refs[`refs/tags/${t}`] = sha
            } catch {}
          }

          const headRef = targetBranch ? `refs/heads/${targetBranch}` : undefined
          // For GRASP/ngit compatibility, the state event's d tag should be just the repo name
          // (the "identifier"), not the full npub:name format.
          const stateRepoId = repo
          const stateEvent = createRepoStateEvent({
            repoId: stateRepoId,
            head: targetBranch, // Just the branch name, createRepoStateEvent adds refs/heads/ prefix
            refs: Object.entries(refs).map(([ref, commit]) => {
              // Extract just the branch/tag name from the full ref path
              // e.g., "refs/heads/master" -> "master", "refs/tags/v1.0" -> "v1.0"
              const isHead = ref.startsWith("refs/heads/")
              const name = isHead ? ref.replace("refs/heads/", "") : ref.replace("refs/tags/", "")
              return {
                type: isHead ? ("heads" as const) : ("tags" as const),
                name,
                commit,
              }
            }),
          })

          if (headRef && !stateEvent.tags.find((t: string[]) => t[0] === "HEAD")) {
            stateEvent.tags.push(["HEAD", `ref: ${headRef}` as any])
          }

          // Publish via EventIO if available
          if (io && typeof (io as any).publishEvent === "function") {
            const pub = (io as any).publishEvent(stateEvent as any, [relayBaseUrl])
            await Promise.race([pub, new Promise(resolve => setTimeout(resolve, 3000))])
            console.log("[GRASP] Pre-push state publish attempted to", relayBaseUrl)
          }
        } catch (e) {
          console.warn("[GRASP] Failed to publish pre-push state; proceeding anyway", e)
        }

        // Build Smart HTTP URL
        const pickSmartHttpUrl = (orig: string): string => {
          const u = new URL(orig)
          let p = u.pathname.startsWith("/git/") ? u.pathname.slice(4) : u.pathname
          if (!p.endsWith(".git")) p = p.endsWith("/") ? `${p.slice(0, -1)}.git` : `${p}.git`
          return `${u.protocol}//${u.host}${p}`
        }

        const pushUrl = pickSmartHttpUrl(remoteUrl)

        // Add remote if needed
        try {
          await (git as any).addRemote({dir, remote: "origin", url: pushUrl})
        } catch (err: any) {
          if (!err.message?.includes("already exists") && !err.message?.includes("Remote named")) {
            throw err
          }
        }

        console.log(`[GRASP] Pushing to ${pushUrl} (ref=refs/heads/${targetBranch})`)

        // GRASP uses unauthenticated git smart HTTP - authorization is handled by
        // the Nostr repo state events (kind 30617/30618), not HTTP headers.
        // This matches ngit's behavior which uses UnauthHttps/UnauthHttp protocols.
        // IMPORTANT: Must set User-Agent starting with "git/" for GRASP servers to accept the request
        try {
          console.log("[GRASP] Push params:", {
            dir,
            url: pushUrl,
            ref: `refs/heads/${targetBranch}`,
            remote: "origin",
          })
          await git.push({
            dir,
            url: pushUrl,
            remote: "origin",
            ref: `refs/heads/${targetBranch}`,
            remoteRef: `refs/heads/${targetBranch}`,
            http: httpWeb,
            force: false,
            headers: {
              "User-Agent": "git/isomorphic-git",
            },
          })
          console.log("[GRASP] Push successful (unauthenticated smart HTTP)")
          return toPlain({success: true, repoId, remoteUrl, branch: targetBranch})
        } catch (pushErr: any) {
          console.error("[GRASP] Push failed:", pushErr)
          // Log more details for debugging
          if (pushErr.data) {
            console.error("[GRASP] Push error data:", pushErr.data)
          }
          if (pushErr.message) {
            console.error("[GRASP] Push error message:", pushErr.message)
          }
          throw pushErr
        }
      }

      // Standard providers or NostrGitProvider
      const onAuth =
        token != null
          ? () => ({username: provider === "gitlab" ? "oauth2" : "token", password: token})
          : getAuthCallback(remoteUrl)

      // Only use NostrGitProvider for Nostr-based URLs (relay.ngit.dev, gitnostr.com, etc.)
      const isNostrUrl =
        remoteUrl.includes("relay.ngit.dev") ||
        remoteUrl.includes("gitnostr.com") ||
        remoteUrl.startsWith("nostr://")

      // Check if NostrGitProvider is available before trying to use it
      if (isNostrUrl && hasNostrGitProvider()) {
        const nostrProvider = getNostrGitProvider()
        const result = await nostrProvider.push({
          dir,
          fs: getProviderFs(git),
          ref: targetBranch,
          remoteRef: targetBranch,
          url: remoteUrl,
          onAuth,
          blossomMirror: blossomMirror ?? Boolean(provider === "blossom"),
        })
        return toPlain({
          success: true,
          branch: targetBranch,
          remoteUrl,
          blossomSummary: result.blossomSummary,
        })
      }

      await (git as any).push({
        dir,
        url: remoteUrl,
        ref: targetBranch,
        remoteRef: targetBranch,
        onAuth,
      })

      return toPlain({success: true, branch: targetBranch, remoteUrl})
    } catch (error) {
      console.error(`Error pushing to remote:`, error)
      return toPlain({
        success: false,
        repoId,
        remoteUrl,
        ...formatError(error, {naddr: repoId, remote: remoteUrl, operation: "push"}),
      })
    }
  },

  // Safe push wrapper (preflight checks + optional confirmation flow)
  async safePushToRemote(opts: SafePushOptions) {
    return toPlain(
      await safePushToRemoteUtil(git, cacheManager, opts, {
        rootDir,
        parseRepoId,
        isRepoCloned: async (dir: string) => isRepoClonedFs(git, dir),
        isShallowClone: async (key: string) => {
          const {dir} = repoKeyAndDir(key)
          return await isShallowClone(dir, git)
        },
        resolveBranchName: async (dir: string, requested?: string) =>
          resolveRobustBranchUtil(git, dir, requested),
        hasUncommittedChanges: async (dir: string) => hasUncommittedChanges(dir, git),
        needsUpdate: async (repoId: string, cloneUrls: string[], cache: RepoCache | null) =>
          needsUpdateUtil(git, repoId, cloneUrls, cache, Date.now()),
        pushToRemote: async (args: {
          repoId: string
          remoteUrl: string
          branch?: string
          token?: string
          provider?: any
        }) => {
          try {
            return await api.pushToRemote({
              repoId: args.repoId,
              remoteUrl: args.remoteUrl,
              branch: args.branch,
              token: args.token,
              provider: args.provider,
            })
          } catch (e: any) {
            return {success: false, error: e?.message || String(e)} as any
          }
        },
      }),
    )
  },

  // Convenience repo ops (useful for UIs)
  async listBranches(opts: {repoId: string}): Promise<string[]> {
    const {dir} = repoKeyAndDir(opts.repoId)
    return toPlain(await (git as any).listBranches({dir}))
  },

  async resolveBranch(opts: {repoId: string; branch?: string}): Promise<string> {
    const {dir} = repoKeyAndDir(opts.repoId)
    return await resolveRobustBranchUtil(git, dir, opts.branch)
  },

  async getCommitHistory(opts: {repoId: string; branch?: string; depth?: number}) {
    try {
      const {key, dir} = repoKeyAndDir(opts.repoId)
      const ref = opts.branch || "main"
      const depth = opts.depth ?? 50

      // Check if the repo is initialized
      const isInClonedSet = clonedRepos.has(key)
      const dataLevel = repoDataLevels.get(key)

      // Also check if the directory actually exists on the filesystem
      const repoExists = await isRepoClonedFs(git, dir)

      console.log(
        `[getCommitHistory] Repo ${key}: inClonedSet=${isInClonedSet}, dataLevel=${dataLevel || "none"}, fsExists=${repoExists}`,
      )

      // If repo doesn't exist at all, return retriable error
      if (!repoExists && !isInClonedSet) {
        return {
          success: false,
          error: "Repository is still being initialized. Please wait and try again.",
          code: "RepoNotReady",
          retriable: true,
        }
      }

      // If repo exists on filesystem but not in our tracking set, add it
      // This can happen if the repo was initialized through a different code path
      if (repoExists && !isInClonedSet) {
        console.log(
          `[getCommitHistory] Repo ${key} exists on filesystem but not in clonedRepos, adding it`,
        )
        clonedRepos.add(key)
        if (!dataLevel) {
          repoDataLevels.set(key, "refs")
        }
      }

      // Build list of refs to try: HEAD first (most reliable), then requested branch, then fallbacks
      const branchesToTry = ["main", "master", "develop", "dev"]
      const refsToTry: string[] = []

      // Try HEAD first - it's the most reliable way to find the current branch
      refsToTry.push("HEAD")

      // Then try the requested branch and its variants
      if (ref && ref !== "HEAD") {
        refsToTry.push(ref)
        refsToTry.push(`origin/${ref}`)
        refsToTry.push(`refs/remotes/origin/${ref}`)
        refsToTry.push(`refs/heads/${ref}`)
      }

      // Add fallback branches if different from requested
      for (const fallback of branchesToTry) {
        if (fallback !== ref && !refsToTry.includes(fallback)) {
          refsToTry.push(fallback)
          refsToTry.push(`origin/${fallback}`)
          refsToTry.push(`refs/remotes/origin/${fallback}`)
          refsToTry.push(`refs/heads/${fallback}`)
        }
      }

      // Strategy 1: Try to resolve ref to OID first, then use OID with git.log
      // This works better for Nostr repos where refs might not be in standard locations
      for (const tryRef of refsToTry) {
        try {
          // First try to resolve the ref to an OID
          const oid = await (git as any).resolveRef({dir, ref: tryRef})
          if (oid && oid.length === 40) {
            // Use the OID directly with git.log - this is more reliable
            const commits = await (git as any).log({dir, ref: oid, depth})
            if (tryRef !== ref) {
              console.log(
                `[getCommitHistory] Resolved '${tryRef}' to OID ${oid.substring(0, 8)}, got ${commits.length} commits`,
              )
              return {success: true, commits: toPlain(commits), fallbackUsed: tryRef}
            }
            console.log(
              `[getCommitHistory] Resolved '${ref}' to OID ${oid.substring(0, 8)}, got ${commits.length} commits`,
            )
            return {success: true, commits: toPlain(commits)}
          }
        } catch (error: any) {
          // Only log when transitioning between branch groups
          if (tryRef === ref) {
            console.log(`[getCommitHistory] Branch '${ref}' not found, trying fallbacks...`)
          }
          // Continue to next ref
        }
      }

      // Strategy 2: Try git.log directly with ref names (fallback)
      console.log(`[getCommitHistory] resolveRef failed for all refs, trying git.log directly`)
      for (const tryRef of refsToTry) {
        try {
          const commits = await (git as any).log({dir, ref: tryRef, depth})
          if (commits && commits.length > 0) {
            console.log(
              `[getCommitHistory] git.log succeeded with ref '${tryRef}', got ${commits.length} commits`,
            )
            return {
              success: true,
              commits: toPlain(commits),
              fallbackUsed: tryRef !== ref ? tryRef : undefined,
            }
          }
        } catch {
          // Continue to next ref
        }
      }

      // Strategy 3: List branches and try them
      console.log(
        `[getCommitHistory] All standard refs failed, trying to find any available branch`,
      )
      try {
        const branches = await (git as any).listBranches({dir})
        console.log(
          `[getCommitHistory] Found ${branches?.length || 0} local branches: ${branches?.join(", ") || "none"}`,
        )
        if (branches && branches.length > 0) {
          for (const branch of branches) {
            try {
              const oid = await (git as any).resolveRef({dir, ref: `refs/heads/${branch}`})
              if (oid) {
                const commits = await (git as any).log({dir, ref: oid, depth})
                console.log(
                  `[getCommitHistory] Used branch '${branch}' (OID: ${oid.substring(0, 8)}), got ${commits.length} commits`,
                )
                return {success: true, commits: toPlain(commits), fallbackUsed: branch}
              }
            } catch {
              // Try next branch
            }
          }
        }
      } catch (e) {
        console.log(`[getCommitHistory] listBranches failed: ${(e as Error).message}`)
      }

      // Strategy 4: Try remote branches
      try {
        const remoteBranches = await (git as any).listBranches({dir, remote: "origin"})
        console.log(
          `[getCommitHistory] Found ${remoteBranches?.length || 0} remote branches: ${remoteBranches?.join(", ") || "none"}`,
        )
        if (remoteBranches && remoteBranches.length > 0) {
          for (const branch of remoteBranches) {
            try {
              const oid = await (git as any).resolveRef({dir, ref: `refs/remotes/origin/${branch}`})
              if (oid) {
                const commits = await (git as any).log({dir, ref: oid, depth})
                console.log(
                  `[getCommitHistory] Used remote branch 'origin/${branch}' (OID: ${oid.substring(0, 8)}), got ${commits.length} commits`,
                )
                return {success: true, commits: toPlain(commits), fallbackUsed: `origin/${branch}`}
              }
            } catch {
              // Try next branch
            }
          }
        }
      } catch (e) {
        console.log(`[getCommitHistory] listBranches(remote) failed: ${(e as Error).message}`)
      }

      // Nothing worked
      return {
        success: false,
        error: `No branches found in repository. Tried: ${refsToTry.slice(0, 5).join(", ")}...`,
        code: "NoBranchesFound",
      }
    } catch (error: any) {
      console.error("[getCommitHistory] Error:", error)
      return {
        success: false,
        ...formatError(error, {
          naddr: opts.repoId,
          ref: opts.branch,
          operation: "getCommitHistory",
        }),
      }
    }
  },

  // Event-based git operations (handle repo initialization automatically)
  async listRepoFilesFromEvent(opts: {
    repoEvent: RepoAnnouncementEvent
    branch?: string
    path?: string
    repoKey?: string
  }) {
    const result = await listRepoFilesFromEvent(opts)
    return toPlain(result)
  },

  async getRepoFileContentFromEvent(opts: {
    repoEvent: RepoAnnouncementEvent
    branch?: string
    path: string
    commit?: string
    repoKey?: string
  }) {
    return await getRepoFileContentFromEvent(opts)
  },

  async listBranchesFromEvent(opts: {repoEvent: RepoAnnouncementEvent}) {
    const result = await listBranchesFromEvent(opts)
    return toPlain(result)
  },

  async fileExistsAtCommit(opts: {
    repoEvent: RepoAnnouncementEvent
    branch?: string
    path: string
    commit?: string
    repoKey?: string
  }) {
    return await fileExistsAtCommit(opts)
  },

  async getFileHistory(opts: {
    repoEvent: RepoAnnouncementEvent
    path: string
    branch: string
    maxCount?: number
    repoKey?: string
  }) {
    const result = await getFileHistory(opts)
    return toPlain(result)
  },

  async listTreeAtCommit(opts: {
    repoEvent: RepoAnnouncementEvent
    commit: string
    path?: string
    repoKey?: string
  }) {
    // Use listRepoFilesFromEvent with commit parameter
    const result = await listRepoFilesFromEvent({
      repoEvent: opts.repoEvent,
      commit: opts.commit,
      path: opts.path,
      repoKey: opts.repoKey,
    })
    return toPlain(result)
  },

  async getCommitHistoryFromEvent(opts: {
    repoEvent: RepoAnnouncementEvent
    branch: string
    depth?: number
  }) {
    // This is an alias for getCommitHistory that works with events
    // Parse repoId from event and delegate to existing method
    const event = opts.repoEvent as any
    const repoId =
      event.id || `${event.pubkey}:${event.tags?.find((t: any[]) => t[0] === "d")?.[1] || "repo"}`
    return await api.getCommitHistory({
      repoId,
      branch: opts.branch,
      depth: opts.depth,
    })
  },

  // --- Additional methods from legacy worker ---

  // Get the current data level for a repository
  getRepoDataLevel(opts: {repoId: string}): "none" | "refs" | "shallow" | "full" {
    const {key} = repoKeyAndDir(opts.repoId)
    if (!clonedRepos.has(key)) return "none"
    return repoDataLevels.get(key) || "none"
  },

  // Clear clone cache and data level tracking
  async clearCloneCache(): Promise<{success: boolean}> {
    clearCloneTracking(clonedRepos, repoDataLevels)
    try {
      await (cacheManager as any).clearOldCache?.()
    } catch (error) {
      console.warn("Failed to clear persistent cache:", error)
    }
    return {success: true}
  },

  // Delete repository and clear cache
  async deleteRepo(opts: {repoId: string}) {
    const {key, dir} = repoKeyAndDir(opts.repoId)
    clonedRepos.delete(key)
    repoDataLevels.delete(key)

    try {
      await (cacheManager as any).deleteRepoCache?.(key)
    } catch (error) {
      console.warn(`Failed to delete cache for ${opts.repoId}:`, error)
    }

    try {
      const fs: any = getProviderFs(git)
      if (fs?.promises?.rmdir) {
        await fs.promises.rmdir(dir, {recursive: true})
      }
      return toPlain({success: true, repoId: opts.repoId})
    } catch (error) {
      console.error(`Failed to delete repo directory ${dir}:`, error)
      return toPlain({
        success: false,
        repoId: opts.repoId,
        ...formatError(error, {naddr: opts.repoId, operation: "deleteRepo"}),
      })
    }
  },

  // Get commit count for a repository
  async getCommitCount(opts: {repoId: string; branch?: string}) {
    const {key, dir} = repoKeyAndDir(opts.repoId)
    let targetBranch = opts.branch || "main"

    try {
      targetBranch = await resolveRobustBranchUtil(git, dir, opts.branch)
      const currentLevel = repoDataLevels.get(key)

      if (currentLevel === "full" || currentLevel === "shallow") {
        const commits = await (git as any).log({dir, ref: targetBranch})
        return toPlain({
          success: true,
          count: commits.length,
          repoId: opts.repoId,
          branch: targetBranch,
          fromCache: true,
        })
      }

      return toPlain({
        success: false,
        repoId: opts.repoId,
        branch: targetBranch,
        error: "Repository not fully cloned. Clone the repository first to get commit count.",
      })
    } catch (error) {
      return toPlain({
        success: false,
        repoId: opts.repoId,
        branch: targetBranch,
        ...formatError(error, {naddr: opts.repoId, ref: targetBranch, operation: "getCommitCount"}),
      })
    }
  },

  // Get detailed commit information including file changes
  async getCommitDetails(opts: {repoId: string; commitId: string; branch?: string}) {
    const {key, dir} = repoKeyAndDir(opts.repoId)

    try {
      // Ensure we have the repository with sufficient depth
      await ensureFullCloneUtil(
        git,
        {repoId: opts.repoId, branch: opts.branch, depth: 100},
        {
          rootDir,
          parseRepoId,
          repoDataLevels,
          clonedRepos,
          isRepoCloned: async (g: GitProvider, d: string) => isRepoClonedFs(g, d),
          resolveBranchName: async (d: string, requested?: string) =>
            resolveRobustBranchUtil(git, d, requested),
          cacheManager,
        },
        makeProgress(opts.repoId, "clone-progress"),
      )

      const commits = await (git as any).log({dir, depth: 1, ref: opts.commitId})
      if (commits.length === 0) {
        throw new Error(`Commit ${opts.commitId} not found`)
      }

      const commit = commits[0]
      const meta = {
        sha: commit.oid,
        author: commit.commit.author.name,
        email: commit.commit.author.email,
        date: commit.commit.author.timestamp * 1000,
        message: commit.commit.message,
        parents: commit.commit.parent || [],
      }

      // Get file changes and diffs
      const changes: Array<{
        path: string
        status: "added" | "modified" | "deleted" | "renamed"
        diffHunks: Array<{
          oldStart: number
          oldLines: number
          newStart: number
          newLines: number
          patches: Array<{line: string; type: "+" | "-" | " "}>
        }>
      }> = []

      // If this is not the initial commit, compare with parent
      if (commit.commit.parent && commit.commit.parent.length > 0) {
        const parentCommit = commit.commit.parent[0]

        // Get the list of changed files
        const changedFiles = await (git as any).walk({
          dir,
          trees: [(git as any).TREE({ref: parentCommit}), (git as any).TREE({ref: commit.oid})],
          map: async function (filepath: string, [A, B]: any[]) {
            // Skip directories
            if (filepath === ".") return
            // Only process file blobs; ignore trees (directories) and other types
            try {
              const at = A ? await A.type() : undefined
              const bt = B ? await B.type() : undefined
              const isABlob = at === "blob"
              const isBBlob = bt === "blob"
              if (!isABlob && !isBBlob) {
                return
              }
            } catch (e) {
              console.warn(`Type detection failed for ${filepath}:`, e)
              // Continue but log the issue
            }

            const Aoid = await A?.oid()
            const Boid = await B?.oid()

            // Determine file status
            let status: "added" | "modified" | "deleted" | "renamed" = "modified"
            if (Aoid === undefined && Boid !== undefined) {
              status = "added"
            } else if (Aoid !== undefined && Boid === undefined) {
              status = "deleted"
            } else if (Aoid !== Boid) {
              status = "modified"
            } else {
              return // No change
            }

            // Get diff for this file
            let diffHunks: Array<{
              oldStart: number
              oldLines: number
              newStart: number
              newLines: number
              patches: Array<{line: string; type: "+" | "-" | " "}>
            }> = []

            try {
              if (status === "added") {
                const blob = await B!.content()
                const lines = new TextDecoder().decode(blob).split("\n")
                diffHunks = [
                  {
                    oldStart: 0,
                    oldLines: 0,
                    newStart: 1,
                    newLines: lines.length,
                    patches: lines.map((line: string) => ({line, type: "+" as const})),
                  },
                ]
              } else if (status === "deleted") {
                const blob = await A!.content()
                const lines = new TextDecoder().decode(blob).split("\n")
                diffHunks = [
                  {
                    oldStart: 1,
                    oldLines: lines.length,
                    newStart: 0,
                    newLines: 0,
                    patches: lines.map((line: string) => ({line, type: "-" as const})),
                  },
                ]
              } else {
                // For modified files, compute actual diff
                const oldBlob = await A!.content()
                const newBlob = await B!.content()
                const oldText = new TextDecoder().decode(oldBlob)
                const newText = new TextDecoder().decode(newBlob)
                const oldLines = oldText.split("\n")
                const newLines = newText.split("\n")

                // Basic diff implementation
                const patches: Array<{line: string; type: "+" | "-" | " "}> = []
                let oldIndex = 0
                let newIndex = 0

                while (oldIndex < oldLines.length || newIndex < newLines.length) {
                  const oldLine = oldLines[oldIndex]
                  const newLine = newLines[newIndex]

                  if (oldIndex >= oldLines.length) {
                    patches.push({line: newLine, type: "+"})
                    newIndex++
                  } else if (newIndex >= newLines.length) {
                    patches.push({line: oldLine, type: "-"})
                    oldIndex++
                  } else if (oldLine === newLine) {
                    patches.push({line: oldLine, type: " "})
                    oldIndex++
                    newIndex++
                  } else {
                    patches.push({line: oldLine, type: "-"})
                    patches.push({line: newLine, type: "+"})
                    oldIndex++
                    newIndex++
                  }
                }

                if (patches.length > 0) {
                  diffHunks = [
                    {
                      oldStart: 1,
                      oldLines: oldLines.length,
                      newStart: 1,
                      newLines: newLines.length,
                      patches,
                    },
                  ]
                }
              }
            } catch (diffError) {
              console.warn(`Failed to generate diff for ${filepath}:`, diffError)
              diffHunks = []
            }

            return {path: filepath, status, diffHunks}
          },
        })

        changes.push(...changedFiles.filter(Boolean))
      } else {
        // Initial commit - show all files as added
        const files = await (git as any).walk({
          dir,
          trees: [(git as any).TREE({ref: opts.commitId})],
          map: async function (filepath: string, [A]: any[]) {
            if (filepath === ".") return
            const oid = await A?.oid()
            if (!oid) return

            try {
              // When reading by OID, don't pass filepath - it's already resolved
              const content = await (git as any).readBlob({dir, oid})
              const lines = new TextDecoder().decode(content.blob).split("\n")
              return {
                path: filepath,
                status: "added" as const,
                diffHunks: [
                  {
                    oldStart: 0,
                    oldLines: 0,
                    newStart: 1,
                    newLines: lines.length,
                    patches: lines.map((line: string) => ({line, type: "+" as const})),
                  },
                ],
              }
            } catch (error) {
              return {path: filepath, status: "added" as const, diffHunks: []}
            }
          },
        })
        changes.push(...files.filter(Boolean))
      }

      return toPlain({success: true, meta, changes})
    } catch (error) {
      return toPlain({
        success: false,
        ...formatError(error, {
          naddr: opts.repoId,
          ref: opts.commitId,
          operation: "getCommitDetails",
        }),
      })
    }
  },

  // Get working tree status for a repository
  async getStatus(opts: {repoId: string; branch?: string}) {
    const {key, dir} = repoKeyAndDir(opts.repoId)

    try {
      const cloned = await isRepoClonedFs(git, dir)
      if (!cloned) {
        return toPlain({
          success: false,
          repoId: opts.repoId,
          branch: opts.branch || "main",
          files: [],
          counts: {},
          error: "Repository not cloned locally",
        })
      }

      const targetBranch = await resolveRobustBranchUtil(git, dir, opts.branch)

      try {
        await (git as any).checkout({dir, ref: targetBranch})
      } catch {
        // ignore checkout errors
      }

      const matrix = await (git as any).statusMatrix({dir})
      type StatusFile = {
        path: string
        head: number
        workdir: number
        stage: number
        status: string
      }

      const files: StatusFile[] = matrix.map((row: any) => {
        const path = row[0] as string
        const head = row[1] as number
        const workdir = row[2] as number
        const stage = row[3] as number
        let status = "unknown"
        if (head === 0 && workdir === 2 && stage === 0) status = "untracked"
        else if (head === 1 && workdir === 0 && stage === 0) status = "deleted"
        else if (head === 1 && workdir === 2 && stage === 1) status = "modified"
        else if (head === 0 && workdir === 2 && stage === 2) status = "added"
        else if (head !== stage) status = "staged"
        return {path, head, workdir, stage, status}
      })

      const counts: Record<string, number> = {}
      for (const f of files) counts[f.status] = (counts[f.status] || 0) + 1

      return toPlain({
        success: true,
        repoId: opts.repoId,
        branch: targetBranch,
        files,
        counts,
      })
    } catch (error) {
      return toPlain({
        success: false,
        repoId: opts.repoId,
        branch: opts.branch || "main",
        files: [],
        counts: {},
        ...formatError(error, {naddr: opts.repoId, ref: opts.branch, operation: "getStatus"}),
      })
    }
  },

  // Reset local repository to match remote HEAD state
  async resetRepoToRemote(opts: {repoId: string; branch?: string}) {
    const {key, dir} = repoKeyAndDir(opts.repoId)

    try {
      const targetBranch = await resolveRobustBranchUtil(git, dir, opts.branch)
      const remotes = await (git as any).listRemotes({dir})
      const originRemote = remotes.find((r: any) => r.remote === "origin")

      if (!originRemote?.url) {
        throw new Error("No origin remote found - cannot reset to remote state")
      }

      const authCallback = getAuthCallback(originRemote.url)
      await (git as any).fetch({
        dir,
        url: originRemote.url,
        ref: targetBranch,
        singleBranch: true,
        ...(authCallback && {onAuth: authCallback}),
      })

      const remoteRef = `refs/remotes/origin/${targetBranch}`
      const remoteCommit = await (git as any).resolveRef({dir, ref: remoteRef})

      await (git as any).checkout({dir, ref: remoteCommit, force: true})
      await (git as any).writeRef({
        dir,
        ref: `refs/heads/${targetBranch}`,
        value: remoteCommit,
        force: true,
      })
      await (git as any).checkout({dir, ref: targetBranch})

      return toPlain({
        success: true,
        repoId: opts.repoId,
        branch: targetBranch,
        remoteCommit,
        message: "Repository reset to remote state",
      })
    } catch (error) {
      return toPlain({
        success: false,
        repoId: opts.repoId,
        branch: opts.branch,
        ...formatError(error, {
          naddr: opts.repoId,
          ref: opts.branch,
          operation: "resetRepoToRemote",
        }),
      })
    }
  },

  // --- Repository Management Functions ---

  // Get .gitignore template content
  async getGitignoreTemplate(opts: {template: string}) {
    const content = await getGitignoreTemplate(opts.template)
    return toPlain({success: true, content})
  },

  // Get license template content
  async getLicenseTemplate(opts: {template: string; authorName: string}) {
    const content = await getLicenseTemplate(opts.template, opts.authorName)
    return toPlain({success: true, content})
  },

  // Create a new local git repository with initial files
  async createLocalRepo(opts: CreateLocalRepoOptions) {
    const result = await createLocalRepo(git, rootDir, clonedRepos, repoDataLevels, opts)
    return toPlain(result)
  },

  // Create a remote repository on GitHub/GitLab/Gitea/GRASP
  async createRemoteRepo(opts: CreateRemoteRepoOptions) {
    const result = await createRemoteRepo(opts)
    return toPlain(result)
  },

  // Fork and clone a repository
  async forkAndCloneRepo(opts: ForkAndCloneOptions) {
    const result = await forkAndCloneRepo(git, cacheManager, rootDir, opts)
    return toPlain(result)
  },

  // Update remote repository metadata
  async updateRemoteRepoMetadata(opts: UpdateRemoteRepoMetadataOptions) {
    const result = await updateRemoteRepoMetadata(opts)
    return toPlain(result)
  },

  // Update and push files to a repository
  async updateAndPushFiles(opts: UpdateAndPushFilesOptions) {
    const result = await updateAndPushFiles(git, opts)
    return toPlain(result)
  },
}

expose(api)
