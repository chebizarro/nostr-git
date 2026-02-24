/**
 * Repository Management Functions
 *
 * Functions for creating, forking, and managing git repositories.
 * These are extracted from the legacy worker to keep the main worker clean.
 */

import type {GitProvider} from "../../git/provider.js"
import type {GitVendor} from "../../git/vendor-providers.js"
import {getGitServiceApi} from "../../git/provider-factory.js"
import {parseRepoFromUrl} from "../../git/vendor-provider-factory.js"
import {getProviderFs, ensureDir, isRepoClonedFs} from "./fs-utils.js"
import {cloneRemoteRepoUtil} from "./repos.js"
import {resolveBranchName as resolveRobustBranch} from "./branches.js"
import {resolveDefaultCorsProxy} from "./git-config.js"
import {withTimeout} from "./timeout.js"
import {parseRepoId} from "../../utils/repo-id.js"

// Helper to generate canonical repo key from repoId
function canonicalRepoKey(repoId: string): string {
  // Use parseRepoId to normalize, then make filesystem-safe
  try {
    const normalized = parseRepoId(repoId)
    return normalized.replace(/[^a-zA-Z0-9_\-\/]/g, "_")
  } catch {
    return repoId.replace(/[^a-zA-Z0-9_\-\/]/g, "_")
  }
}

async function ensureOriginFetchRefspec(
  git: GitProvider,
  dir: string,
  url?: string,
): Promise<void> {
  if (
    typeof (git as any).getConfig !== "function" ||
    typeof (git as any).setConfig !== "function"
  ) {
    return
  }

  try {
    const fetchSpec = await git.getConfig({dir, path: "remote.origin.fetch"})
    if (!fetchSpec) {
      await git.setConfig({
        dir,
        path: "remote.origin.fetch",
        value: "+refs/heads/*:refs/remotes/origin/*",
      })
    }
  } catch {}

  if (!url) return

  try {
    const originUrl = await git.getConfig({dir, path: "remote.origin.url"})
    if (!originUrl) {
      await git.setConfig({dir, path: "remote.origin.url", value: url})
    }
  } catch {}
}

const FORK_TIMEOUTS = {
  forkRepoMs: 60_000,
  getRepoMs: 10_000,
  createRepoMs: 60_000,
  fetchHistoryMs: 120_000,
  pushMs: 180_000,
}

// ============================================================================
// Template Functions
// ============================================================================

const GITIGNORE_TEMPLATES: Record<string, string> = {
  node: `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*

# Build output
dist/
build/

# Environment
.env
.env.local

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db`,

  python: `# Byte-compiled
__pycache__/
*.py[cod]
*$py.class

# Distribution
dist/
build/
*.egg-info/

# Virtual environments
.env
.venv
env/
venv/

# Testing
.pytest_cache/
.coverage

# OS
.DS_Store`,

  web: `# Dependencies
node_modules/

# Build output
dist/
build/
.next/
.nuxt/

# Environment
.env
.env.local

# Logs
*.log

# OS
.DS_Store
Thumbs.db`,

  svelte: `# Dependencies
node_modules/

# Build output
/build/
/dist/
.svelte-kit/

# Environment
.env
.env.local

# OS
.DS_Store`,

  java: `# Compiled
*.class
target/
build/

# Package files
*.jar
*.war
*.ear

# IDE
.idea/
*.iml

# OS
.DS_Store`,

  go: `# Binaries
*.exe
*.dll
*.so
*.dylib
*.test

# Output
bin/
dist/

# OS
.DS_Store`,

  rust: `# Build output
/target/
Cargo.lock

# OS
.DS_Store`,
}

/**
 * Get .gitignore template content for various languages/frameworks
 */
export async function getGitignoreTemplate(template: string): Promise<string> {
  return GITIGNORE_TEMPLATES[template] || ""
}

/**
 * Get license template content
 */
export async function getLicenseTemplate(template: string, authorName: string): Promise<string> {
  const currentYear = new Date().getFullYear()

  const templates: Record<string, string> = {
    mit: `MIT License

Copyright (c) ${currentYear} ${authorName}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,

    "apache-2.0": `Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

Copyright ${currentYear} ${authorName}

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`,

    "gpl-3.0": `GNU GENERAL PUBLIC LICENSE
Version 3, 29 June 2007

Copyright (C) ${currentYear} ${authorName}

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.`,

    unlicense: `This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any means.`,
  }

  return templates[template] || ""
}

// ============================================================================
// Repository Creation Functions
// ============================================================================

export interface CreateLocalRepoOptions {
  repoId: string
  name: string
  description?: string
  defaultBranch?: string
  initializeWithReadme?: boolean
  gitignoreTemplate?: string
  licenseTemplate?: string
  authorName: string
  authorEmail: string
}

export interface CreateLocalRepoResult {
  success: boolean
  repoId: string
  commitSha?: string
  files?: string[]
  error?: string
}

/**
 * Create a new local git repository with initial files
 */
export async function createLocalRepo(
  git: GitProvider,
  rootDir: string,
  clonedRepos: Set<string>,
  repoDataLevels: Map<string, string>,
  options: CreateLocalRepoOptions,
): Promise<CreateLocalRepoResult> {
  const {
    repoId,
    name,
    description,
    defaultBranch = "main",
    initializeWithReadme = true,
    gitignoreTemplate = "none",
    licenseTemplate = "none",
    authorName,
    authorEmail,
  } = options

  const key = canonicalRepoKey(repoId)
  const dir = `${rootDir}/${key}`

  try {
    console.log(`Creating local repository: ${name}`)

    // Initialize git repository
    await git.init({dir, defaultBranch})

    // Create initial files based on options
    const files: Array<{path: string; content: string}> = []

    // README.md
    if (initializeWithReadme) {
      const readmeContent = `# ${name}\n\n${description || "A new repository created with Flotilla-Budabit"}\n`
      files.push({path: "README.md", content: readmeContent})
    }

    // .gitignore
    if (gitignoreTemplate !== "none") {
      const gitignoreContent = await getGitignoreTemplate(gitignoreTemplate)
      if (gitignoreContent) {
        files.push({path: ".gitignore", content: gitignoreContent})
      }
    }

    // LICENSE
    if (licenseTemplate !== "none") {
      const licenseContent = await getLicenseTemplate(licenseTemplate, authorName)
      if (licenseContent) {
        files.push({path: "LICENSE", content: licenseContent})
      }
    }

    // Write files to repository
    const fs = getProviderFs(git)
    if (!fs || !fs.promises) {
      throw new Error("File system provider is not available")
    }

    for (const file of files) {
      const filePath = `${dir}/${file.path}`

      // Ensure directory exists for nested files
      const pathParts = file.path.split("/")
      if (pathParts.length > 1) {
        const dirPath = pathParts.slice(0, -1).join("/")
        const fullDirPath = `${dir}/${dirPath}`
        try {
          await ensureDir(fs, fullDirPath)
        } catch {
          // Directory might already exist
        }
      }

      await fs.promises.writeFile(filePath, file.content, "utf8")
      await git.add({dir, filepath: file.path})
    }

    // Create initial commit
    const commitSha = await git.commit({
      dir,
      message: "Initial commit",
      author: {name: authorName, email: authorEmail},
    })

    // Update tracking
    clonedRepos.add(key)
    repoDataLevels.set(key, "full")

    console.log(`Local repository created successfully: ${commitSha}`)

    return {
      success: true,
      repoId,
      commitSha,
      files: files.map(f => f.path),
    }
  } catch (error) {
    console.error(`Error creating local repository ${repoId}:`, error)
    return {
      success: false,
      repoId,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ============================================================================
// Remote Repository Functions
// ============================================================================

export interface CreateRemoteRepoOptions {
  provider: GitVendor
  token: string
  name: string
  description?: string
  isPrivate?: boolean
  baseUrl?: string
}

export interface CreateRemoteRepoResult {
  success: boolean
  remoteUrl?: string
  provider?: GitVendor
  error?: string
}

/**
 * Create a remote repository on GitHub/GitLab/Gitea/GRASP
 */
export async function createRemoteRepo(
  options: CreateRemoteRepoOptions,
): Promise<CreateRemoteRepoResult> {
  const {provider, token, name, description, isPrivate = false, baseUrl} = options

  try {
    console.log(`Creating remote repository on ${provider}: ${name}`)

    if (!token || token.trim() === "") {
      throw new Error("No authentication token provided")
    }

    // Use GitServiceApi abstraction
    const api = getGitServiceApi(provider, token, baseUrl)

    // Create repository using unified API
    const repoMetadata = await api.createRepo({
      name,
      description,
      private: isPrivate,
      autoInit: false,
    })

    let remoteUrl = repoMetadata.cloneUrl

    // For GRASP, ensure clone URL uses HTTP(S) scheme, not WS(S)
    if (provider === "grasp") {
      remoteUrl = remoteUrl.replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://")
    }

    console.log(`Remote repository created: ${remoteUrl}`)

    return {success: true, remoteUrl, provider}
  } catch (error) {
    console.error(`Error creating remote repository:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ============================================================================
// Fork Functions
// ============================================================================

export interface ForkAndCloneOptions {
  owner: string
  repo: string
  forkName: string
  visibility: "public" | "private"
  token: string
  dir: string
  provider?: string
  baseUrl?: string
  sourceCloneUrls?: string[] // For cross-platform forking (e.g., Nostr repo to GitHub)
  sourceRepoId?: string // Canonical repo ID for finding existing local clone
  workflowFilesAction?: "include" | "omit"
  onProgress?: (stage: string, pct?: number) => void
}

export interface ForkAndCloneResult {
  success: boolean
  repoId: string
  forkUrl: string
  defaultBranch: string
  branches: string[]
  tags: string[]
  error?: string
  requiresWorkflowDecision?: boolean
  workflowFiles?: string[]
}

/**
 * Fork and clone a repository using Git provider API
 */
export async function forkAndCloneRepo(
  git: GitProvider,
  cacheManager: any,
  rootDir: string,
  options: ForkAndCloneOptions,
): Promise<ForkAndCloneResult> {
  const {
    owner,
    repo,
    forkName,
    visibility,
    token,
    dir,
    provider = "github",
    baseUrl,
    sourceCloneUrls,
    sourceRepoId,
    workflowFilesAction,
    onProgress,
  } = options

  const forkContext = {
    operation: "forkAndCloneRepo",
    provider,
    owner,
    repo,
    forkName,
    baseUrl,
  }

  const runTimed = async <T>(
    label: string,
    timeoutMs: number,
    operation: () => Promise<T>,
    detail?: Record<string, unknown>,
  ): Promise<T> => {
    const startedAt = Date.now()
    if (detail) {
      console.log(`[forkAndCloneRepo] ${label} start`, detail)
    } else {
      console.log(`[forkAndCloneRepo] ${label} start`)
    }
    try {
      const result = await withTimeout(operation(), {
        timeoutMs,
        label,
        context: {...forkContext, operation: label},
      })
      console.log(`[forkAndCloneRepo] ${label} success in ${Date.now() - startedAt}ms`)
      return result
    } catch (error) {
      console.error(`[forkAndCloneRepo] ${label} failed after ${Date.now() - startedAt}ms`, error)
      throw error
    }
  }

  let workflowRestoreState: {dir: string; branch: string; head: string} | null = null
  let fallbackMetadata: {defaultBranch?: string; branches?: string[]; tags?: string[]} | null = null

  try {
    onProgress?.("Creating remote fork...", 10)

    // Validate inputs
    if (!owner?.trim() || !repo?.trim() || !forkName?.trim()) {
      throw new Error(
        `Invalid parameters for fork: owner="${owner}", repo="${repo}", forkName="${forkName}"`,
      )
    }

    console.log("[forkAndCloneRepo] Input params", {
      provider,
      baseUrl,
      owner,
      repo,
      forkName,
      sourceCloneUrls,
    })

    // Create remote fork using GitServiceApi
    const gitServiceApi = getGitServiceApi(provider as GitVendor, token, baseUrl)

    let forkResult
    let isCrossPlatformFork = false

    const shouldUseCustomNameFallback =
      provider === "github" && forkName !== repo && !!sourceCloneUrls?.length

    if (shouldUseCustomNameFallback) {
      console.log(
        "[forkAndCloneRepo] Using cross-platform path for custom GitHub fork name:",
        forkName,
      )
      isCrossPlatformFork = true
    }

    if (!isCrossPlatformFork) {
      try {
        forkResult = await runTimed(
          "forkRepo",
          FORK_TIMEOUTS.forkRepoMs,
          () => gitServiceApi.forkRepo(owner, repo, {name: forkName}),
          {provider, owner, repo, forkName},
        )
      } catch (e: any) {
        console.error("[forkAndCloneRepo] forkRepo failed", {
          owner,
          repo,
          forkName,
          error: e?.message,
        })

        // Check if this is an error indicating source repo doesn't exist on target platform
        // or that we need to do a cross-platform fork
        // - 404: GitHub/GitLab repo not found
        // - 422: GitLab "Unable to access repository" when trying to import
        // - GRASP: "not supported without external EventIO" - need cross-platform fork
        const is404 = e?.message?.includes("404") || e?.message?.includes("Not Found")
        const isGitLabImportError =
          e?.message?.includes("422") && e?.message?.includes("Unable to access")
        const isGraspNotSupported =
          e?.message?.includes("GRASP") && e?.message?.includes("not supported")

        if (is404 || isGitLabImportError || isGraspNotSupported) {
          if (sourceCloneUrls && sourceCloneUrls.length > 0) {
            console.log(
              "[forkAndCloneRepo] Source repo not found on target platform, attempting cross-platform fork",
            )
            isCrossPlatformFork = true
          } else {
            throw new Error(
              `Source repository "${owner}/${repo}" not found on ${provider}. ` +
                `For cross-platform forking, the source repository's clone URLs must be provided.`,
            )
          }
        } else {
          throw e
        }
      }
    }

    const absoluteDir = dir.startsWith("/") ? dir : `${rootDir}/${dir}`
    let forkUrl: string
    let forkOwnerLogin: string
    let metadataDir = absoluteDir // Directory to use for gathering metadata at the end

    if (isCrossPlatformFork) {
      // Cross-platform fork: use existing local clone or clone from source, then create new repo and push
      onProgress?.("Checking for existing local clone...", 20)

      // Check multiple possible locations for existing clone:
      // 1. The sourceRepoId path (canonical repo ID from the source repo)
      // 2. The destination directory (absoluteDir) - might already have the repo
      // 3. A directory based on owner/repo format
      let workingDir = absoluteDir
      let foundExistingClone = false

      // First, try the sourceRepoId if provided (most reliable - this is the canonical path)
      if (sourceRepoId) {
        const sourceRepoDir = `${rootDir}/${sourceRepoId}`
        console.log("[forkAndCloneRepo] Checking sourceRepoId path:", sourceRepoDir)
        const sourceRepoCloned = await isRepoClonedFs(git, sourceRepoDir)
        if (sourceRepoCloned) {
          console.log(
            "[forkAndCloneRepo] Found existing local clone at sourceRepoId path:",
            sourceRepoDir,
          )
          onProgress?.("Using existing local clone...", 25)
          workingDir = sourceRepoDir
          foundExistingClone = true
        }
      }

      // If not found, check if the destination directory already has a clone
      if (!foundExistingClone) {
        const destCloned = await isRepoClonedFs(git, absoluteDir)
        if (destCloned) {
          console.log("[forkAndCloneRepo] Found existing local clone at destination:", absoluteDir)
          onProgress?.("Using existing local clone...", 25)
          workingDir = absoluteDir
          foundExistingClone = true
        }
      }

      // If not found at destination, try owner/repo format
      if (!foundExistingClone) {
        const sourceRepoKey = `${owner}/${repo}`
        const sourceDir = `${rootDir}/${sourceRepoKey}`
        const sourceCloned = await isRepoClonedFs(git, sourceDir)
        if (sourceCloned) {
          console.log("[forkAndCloneRepo] Found existing local clone at source path:", sourceDir)
          onProgress?.("Using existing local clone...", 25)
          workingDir = sourceDir
          foundExistingClone = true
        }
      }

      if (!foundExistingClone) {
        // Try each source clone URL until one works
        console.log("[forkAndCloneRepo] No existing clone found, will clone from remote")
        onProgress?.("Cloning source repository...", 20)
        let cloneSuccess = false
        let lastError: Error | null = null

        for (const sourceUrl of sourceCloneUrls!) {
          try {
            const cloneStartedAt = Date.now()
            console.log("[forkAndCloneRepo] Trying to clone from:", sourceUrl)
            await cloneRemoteRepoUtil(git, cacheManager, {
              url: sourceUrl,
              dir: absoluteDir,
              depth: 50,
              token: undefined, // Source may not need auth or use different auth
              onProgress: (message: string, percentage?: number) => {
                onProgress?.(message, 20 + (percentage || 0) * 0.3)
              },
            })
            console.log(
              "[forkAndCloneRepo] Clone succeeded from:",
              sourceUrl,
              `in ${Date.now() - cloneStartedAt}ms`,
            )
            cloneSuccess = true
            break
          } catch (cloneError: any) {
            console.warn("[forkAndCloneRepo] Clone failed for URL:", sourceUrl, cloneError?.message)
            lastError = cloneError
          }
        }

        if (!cloneSuccess) {
          throw new Error(`Failed to clone source repository from any URL: ${lastError?.message}`)
        }
        workingDir = absoluteDir
      }

      console.log("[forkAndCloneRepo] Using working directory:", workingDir)

      // For GRASP as target, we don't create a repo via API or push via git
      // GRASP uses Nostr events - the UI layer will publish the repo announcement
      if (provider === "grasp") {
        console.log(
          "[forkAndCloneRepo] GRASP target - skipping createRepo and push, UI will publish events",
        )
        onProgress?.("Repository cloned locally, ready for Nostr announcement...", 90)

        // Get branch info for the result
        const branches = await git.listBranches({dir: workingDir})
        let defaultBranch = branches[0] || "main"
        if (branches.includes("main")) defaultBranch = "main"
        else if (branches.includes("master")) defaultBranch = "master"

        // For GRASP, the fork URL will be constructed by the UI using the relay URL
        // Use the baseUrl (relay URL) as the base for the clone URL
        const graspCloneUrl = baseUrl
          ? `${baseUrl.replace("wss://", "https://")}/${token}/${forkName}.git`
          : ""

        metadataDir = workingDir

        // Return success - the UI will handle publishing the Nostr events
        return {
          success: true,
          repoId: `${token}/${forkName}`, // For GRASP, token is the user's pubkey
          forkUrl: graspCloneUrl,
          defaultBranch,
          branches,
          tags: await git.listTags({dir: workingDir}),
        }
      }

      onProgress?.("Creating new repository on target platform...", 55)

      // Create a new empty repo on the target platform
      let newRepoResult
      try {
        newRepoResult = await runTimed(
          "createRepo",
          FORK_TIMEOUTS.createRepoMs,
          () =>
            gitServiceApi.createRepo({
              name: forkName,
              description: `Fork of ${owner}/${repo}`,
              private: visibility === "private",
            }),
          {provider, forkName},
        )
      } catch (createErr: any) {
        console.warn("[forkAndCloneRepo] createRepo failed, checking for existing repo:", createErr)
        try {
          const currentUser = await gitServiceApi.getCurrentUser()
          newRepoResult = await gitServiceApi.getRepo(currentUser.login, forkName)
          console.log("[forkAndCloneRepo] Using existing repo:", newRepoResult?.cloneUrl)
        } catch {
          throw createErr
        }
      }

      forkUrl = newRepoResult.cloneUrl
      forkOwnerLogin = newRepoResult.owner.login
      console.log("[forkAndCloneRepo] Created new repo:", {forkUrl, forkOwnerLogin})

      onProgress?.("Pushing to new repository...", 70)

      // Add the new repo as remote and push (use workingDir which may be existing local clone)
      console.log("[forkAndCloneRepo] Working directory:", workingDir)

      // Try to add remote, ignore if it already exists
      try {
        await git.addRemote({dir: workingDir, remote: "fork-target", url: forkUrl})
      } catch (e: any) {
        if (!e?.message?.includes("already exists")) throw e
        // Remote already exists, update it
        await git.deleteRemote({dir: workingDir, remote: "fork-target"}).catch(() => {})
        await git.addRemote({dir: workingDir, remote: "fork-target", url: forkUrl})
      }

      // Get the actual branch name (not HEAD) - list branches and pick the first one
      // or try common branch names
      const branches = await git.listBranches({dir: workingDir})
      let defaultBranch = branches[0] || "main"

      // Prefer main/master if available
      if (branches.includes("main")) {
        defaultBranch = "main"
      } else if (branches.includes("master")) {
        defaultBranch = "master"
      }

      const tags = await git.listTags({dir: workingDir}).catch(() => [])
      fallbackMetadata = {defaultBranch, branches, tags}

      console.log(
        "[forkAndCloneRepo] Pushing branch:",
        defaultBranch,
        "available branches:",
        branches,
      )
      console.log("[forkAndCloneRepo] Push URL:", forkUrl, "token length:", token?.length)

      const corsProxy = resolveDefaultCorsProxy()
      console.log("[forkAndCloneRepo] Using corsProxy for fetch:", corsProxy)
      const isWorkflowScopeError = (error: any): boolean => {
        if (provider !== "github") return false
        const message = [
          error?.message,
          error?.data?.prettyDetails,
          error?.data?.result?.refs?.["refs/heads/master"]?.error,
          error?.data?.result?.refs?.["refs/heads/main"]?.error,
        ]
          .filter(Boolean)
          .join(" ")
        return /workflow|\.github\/workflows/i.test(message)
      }

      const listWorkflowFiles = async (): Promise<string[]> => {
        try {
          const files = await git.listFiles({dir: workingDir})
          return files.filter(file => file.startsWith(".github/workflows/"))
        } catch (listErr: any) {
          console.warn("[forkAndCloneRepo] Failed to list workflow files:", listErr?.message)
          return []
        }
      }

      const listWorkflowFilesFromTree = async (commitOid: string): Promise<string[]> => {
        try {
          const {tree} = await git.readTree({
            dir: workingDir,
            oid: commitOid,
            filepath: ".github/workflows",
          })
          return tree.map((entry: any) => `.github/workflows/${entry.path}`)
        } catch (treeErr: any) {
          console.warn("[forkAndCloneRepo] Failed to read workflow tree:", treeErr?.message)
          return []
        }
      }

      const isNostrRelayUrl = (url: string): boolean =>
        /relay\.ngit\.dev|gitnostr\.com|grasp/i.test(url)

      const resolveSourceUrls = (reason: string): string[] => {
        if (!sourceCloneUrls || sourceCloneUrls.length === 0) return []

        const deduped: string[] = []
        for (const url of sourceCloneUrls) {
          if (!deduped.includes(url)) deduped.push(url)
        }

        if (reason === "missing objects") {
          const nonRelay = deduped.filter(url => !isNostrRelayUrl(url))
          const relay = deduped.filter(isNostrRelayUrl)
          return [...nonRelay, ...relay]
        }

        return deduped
      }

      const fetchFromSourceUrls = async (reason: string): Promise<boolean> => {
        const urlsToTry = resolveSourceUrls(reason)
        if (urlsToTry.length === 0) return false

        console.log(`[forkAndCloneRepo] ${reason} - trying source URLs:`, urlsToTry)

        for (const sourceUrl of urlsToTry) {
          try {
            console.log(`[forkAndCloneRepo] ${reason} - fetching full history from:`, sourceUrl)
            await runTimed(
              `fetch full history (source ${reason})`,
              FORK_TIMEOUTS.fetchHistoryMs,
              () =>
                git.fetch({
                  dir: workingDir,
                  url: sourceUrl,
                  tags: true,
                  corsProxy,
                }),
              {url: sourceUrl},
            )
            console.log("[forkAndCloneRepo] Fetch succeeded from:", sourceUrl)
            return true
          } catch (fetchErr: any) {
            console.warn("[forkAndCloneRepo] Fetch failed for:", sourceUrl, fetchErr?.message)
          }
        }

        return false
      }

      const resolveHeadCommit = async (): Promise<string | undefined> => {
        const candidateRefs = [
          `refs/heads/${defaultBranch}`,
          defaultBranch,
          `refs/remotes/origin/${defaultBranch}`,
          "HEAD",
          "FETCH_HEAD",
        ]

        for (const ref of candidateRefs) {
          try {
            const oid = await git.resolveRef({dir: workingDir, ref})
            if (oid) return oid
          } catch {}
        }

        return undefined
      }

      // For cross-platform fork, we ALWAYS need to fetch full history before pushing
      // The local clone may be shallow or missing objects even if .git/shallow doesn't exist
      // GitHub will reject pushes with missing parent commits
      const fs: any = (git as any).fs
      const shallowFile = `${workingDir}/.git/shallow`

      // Check if shallow file exists (for logging)
      let hasShallowFile = false
      try {
        await fs.promises.stat(shallowFile)
        hasShallowFile = true
        console.log("[forkAndCloneRepo] Shallow file exists - will fetch full history")
      } catch {
        console.log(
          "[forkAndCloneRepo] No shallow file, but will still fetch full history to ensure all objects are present",
        )
      }

      // ALWAYS fetch full history for cross-platform fork to ensure we have all objects
      {
        console.log("[forkAndCloneRepo] Unshallowing clone by fetching full history...")
        onProgress?.("Fetching full commit history...", 72)

        let unshallowed = false

        // First, try to fetch from the existing origin remote (this is the URL that worked for the initial clone)
        try {
          const remotes = await git.listRemotes({dir: workingDir})
          const originRemote = remotes.find((r: any) => r.remote === "origin")
          if (originRemote?.url) {
            console.log(
              "[forkAndCloneRepo] Trying to fetch full history from existing origin:",
              originRemote.url,
            )
            await ensureOriginFetchRefspec(git, workingDir, originRemote.url)
            // Fetch ALL refs without depth limit to get complete history
            await runTimed(
              "fetch full history (origin)",
              FORK_TIMEOUTS.fetchHistoryMs,
              () =>
                git.fetch({
                  dir: workingDir,
                  remote: "origin",
                  tags: true, // Also fetch tags
                  corsProxy,
                }),
              {remote: "origin", url: originRemote.url},
            )
            console.log("[forkAndCloneRepo] Fetch from origin succeeded")
            unshallowed = true
          }
        } catch (originErr: any) {
          console.warn("[forkAndCloneRepo] Fetch from origin failed:", originErr?.message)
        }

        // If origin fetch failed, try the provided source URLs
        if (!unshallowed) {
          const fetchedFromSources = await fetchFromSourceUrls("fallback")
          if (fetchedFromSources) {
            unshallowed = true
          }
        }

        if (!unshallowed) {
          throw new Error(
            "Could not fetch full history from any source - cannot push to GitHub without complete history",
          )
        }

        // Remove shallow file if it exists
        if (hasShallowFile) {
          try {
            await fs.promises.unlink(shallowFile)
            console.log("[forkAndCloneRepo] Removed shallow file")
          } catch {}
        }
      }

      // Verify we have commits and check for missing objects
      let headCommit: string | undefined
      let historyIncomplete = false
      try {
        const log = await git.log({dir: workingDir, depth: 100, ref: defaultBranch})
        console.log(
          "[forkAndCloneRepo] Local commits available:",
          log?.length || 0,
          "first:",
          log?.[0]?.oid?.substring(0, 8),
        )
        if (log && log.length > 0) {
          headCommit = log[0].oid
          // Check if we have all parent commits by walking the tree
          let missingParent = false
          for (const commit of log) {
            if (commit.commit?.parent) {
              for (const parentOid of commit.commit.parent) {
                try {
                  await git.readCommit({dir: workingDir, oid: parentOid})
                } catch {
                  console.warn("[forkAndCloneRepo] Missing parent commit:", parentOid)
                  missingParent = true
                  break
                }
              }
            }
            if (missingParent) break
          }
          if (missingParent) {
            historyIncomplete = true
            console.log(
              "[forkAndCloneRepo] Repository has incomplete history - some parent commits are missing",
            )
          }
        } else {
          historyIncomplete = true
        }
      } catch (logErr: any) {
        historyIncomplete = true
        console.warn("[forkAndCloneRepo] Could not get log:", logErr?.message)
      }

      if (!headCommit) {
        headCommit = await resolveHeadCommit()
        if (headCommit) {
          console.log(
            "[forkAndCloneRepo] Resolved head commit from refs:",
            headCommit.substring(0, 8),
          )
        }
      }

      if (historyIncomplete) {
        console.warn(
          "[forkAndCloneRepo] Detected incomplete history - attempting to fetch missing objects",
        )
        const refetched = await fetchFromSourceUrls("missing objects")
        if (refetched && !headCommit) {
          headCommit = await resolveHeadCommit()
        }
      }

      let workflowFiles = provider === "github" ? await listWorkflowFiles() : []
      if (provider === "github" && workflowFiles.length === 0) {
        const headOid = headCommit || (await resolveHeadCommit())
        if (headOid) {
          workflowFiles = await listWorkflowFilesFromTree(headOid)
        }
      }

      console.log("[forkAndCloneRepo] Workflow files detected:", {
        count: workflowFiles.length,
        workflowFilesAction,
      })

      // Push the default branch with retry logic
      // New GitHub repos may need a moment to be ready for push
      const maxPushRetries = 3
      let pushSuccess = false
      let lastPushError: Error | null = null
      let retriedMissingObjects = false

      const shouldOmitWorkflows =
        provider === "github" && workflowFilesAction === "omit" && workflowFiles.length > 0

      if (shouldOmitWorkflows) {
        try {
          await git.checkout({dir: workingDir, ref: defaultBranch})
        } catch (checkoutErr: any) {
          console.warn(
            "[forkAndCloneRepo] Failed to checkout default branch before omit:",
            checkoutErr?.message,
          )
        }
        const originalHead = await git
          .resolveRef({dir: workingDir, ref: `refs/heads/${defaultBranch}`})
          .catch(() => undefined)

        if (originalHead) {
          workflowRestoreState = {
            dir: workingDir,
            branch: defaultBranch,
            head: originalHead,
          }
        }

        for (const filepath of workflowFiles) {
          try {
            await git.remove({dir: workingDir, filepath})
          } catch (removeErr: any) {
            console.warn(
              "[forkAndCloneRepo] Failed to remove workflow file:",
              filepath,
              removeErr?.message,
            )
          }
        }

        const omitCommitOid = await git.commit({
          dir: workingDir,
          message: `Fork of ${owner}/${repo}\n\nWorkflows omitted to avoid GitHub workflow-scope restrictions.`,
          parent: [],
          author: {
            name: "Flotilla Fork",
            email: "fork@flotilla.app",
            timestamp: Math.floor(Date.now() / 1000),
            timezoneOffset: 0,
          },
          committer: {
            name: "Flotilla Fork",
            email: "fork@flotilla.app",
            timestamp: Math.floor(Date.now() / 1000),
            timezoneOffset: 0,
          },
        })

        await git.writeRef({
          dir: workingDir,
          ref: `refs/heads/${defaultBranch}`,
          value: omitCommitOid,
          force: true,
        })

        const remainingWorkflowFiles = await listWorkflowFiles()
        if (remainingWorkflowFiles.length > 0) {
          console.warn(
            "[forkAndCloneRepo] Workflow files still present after omit attempt:",
            remainingWorkflowFiles,
          )
        }

        console.log("[forkAndCloneRepo] Created workflow-omitted commit:", omitCommitOid)
      }

      // First, try a normal push
      for (let attempt = 1; attempt <= maxPushRetries && !pushSuccess; attempt++) {
        try {
          console.log(`[forkAndCloneRepo] Push attempt ${attempt}/${maxPushRetries}`)

          await runTimed(
            "push",
            FORK_TIMEOUTS.pushMs,
            () =>
              git.push({
                dir: workingDir,
                url: forkUrl,
                ref: defaultBranch,
                remoteRef: `refs/heads/${defaultBranch}`,
                force: true,
                onAuth: () => {
                  console.log("[forkAndCloneRepo] onAuth called for push, provider:", provider)
                  // Different providers use different auth formats:
                  // GitHub: username can be "token", "x-access-token", or the actual username
                  // GitLab: username should be "oauth2" for PATs
                  if (provider === "gitlab") {
                    return {username: "oauth2", password: token}
                  }
                  return {username: "token", password: token}
                },
                onAuthSuccess: () => {
                  console.log("[forkAndCloneRepo] Auth succeeded")
                },
                onAuthFailure: (url: string, auth: any) => {
                  console.error("[forkAndCloneRepo] Auth failure for URL:", url)
                  return undefined
                },
              }),
            {attempt, forkUrl, defaultBranch},
          )
          console.log("[forkAndCloneRepo] Push successful")
          pushSuccess = true
        } catch (pushError: any) {
          lastPushError = pushError
          const isNotFoundError =
            pushError?.code === "NotFoundError" || pushError?.message?.includes("Could not find")
          console.warn(`[forkAndCloneRepo] Push attempt ${attempt} failed:`, pushError?.message)

          if (pushError?.data) {
            console.warn(
              "[forkAndCloneRepo] Push error data:",
              JSON.stringify(pushError.data, null, 2),
            )
          }
          if (pushError?.code) {
            console.warn("[forkAndCloneRepo] Error code:", pushError.code)
          }

          if (isNotFoundError && !retriedMissingObjects) {
            retriedMissingObjects = true
            console.warn(
              "[forkAndCloneRepo] Missing objects detected - refetching from source URLs",
            )
            const refetched = await fetchFromSourceUrls("missing objects")
            if (refetched && !headCommit) {
              headCommit = await resolveHeadCommit()
            }
          }

          if (isWorkflowScopeError(pushError)) {
            if (workflowFilesAction) {
              return {
                success: false,
                repoId: "",
                forkUrl: "",
                defaultBranch: "",
                branches: [],
                tags: [],
                error:
                  "GitHub rejected this push because the token lacks workflow scope for .github/workflows files. Update your token or remove workflow files and retry.",
              }
            }
            return {
              success: false,
              repoId: "",
              forkUrl: "",
              defaultBranch: "",
              branches: [],
              tags: [],
              error:
                "GitHub rejected this push because the token lacks workflow scope for .github/workflows files.",
              requiresWorkflowDecision: true,
              workflowFiles,
            }
          }

          // If we're missing objects, try creating an orphan commit with the current tree
          if (isNotFoundError && attempt === maxPushRetries) {
            console.log(
              "[forkAndCloneRepo] Missing git objects - creating orphan commit with current tree state",
            )
            onProgress?.("Creating fresh commit from current files...", 80)

            try {
              let treeOid: string | undefined
              const originalHead = headCommit || "unavailable"

              if (headCommit) {
                try {
                  const currentCommit = await git.readCommit({dir: workingDir, oid: headCommit})
                  treeOid = currentCommit.commit.tree
                } catch (readCommitErr: any) {
                  console.warn(
                    "[forkAndCloneRepo] Failed to read head commit, falling back to writeTree:",
                    readCommitErr?.message,
                  )
                }
              }

              if (!treeOid) {
                try {
                  treeOid = await git.writeTree({dir: workingDir})
                } catch (writeTreeErr: any) {
                  console.warn(
                    "[forkAndCloneRepo] Failed to write tree from working directory:",
                    writeTreeErr?.message,
                  )
                }
              }

              // Create a new orphan commit with no parents
              const commitOptions: any = {
                dir: workingDir,
                message: `Fork of ${owner}/${repo}\n\nCreated from Nostr repository with incomplete history.\nOriginal HEAD: ${originalHead}`,
                parent: [], // No parents = orphan commit
                author: {
                  name: "Flotilla Fork",
                  email: "fork@flotilla.app",
                  timestamp: Math.floor(Date.now() / 1000),
                  timezoneOffset: 0,
                },
                committer: {
                  name: "Flotilla Fork",
                  email: "fork@flotilla.app",
                  timestamp: Math.floor(Date.now() / 1000),
                  timezoneOffset: 0,
                },
              }

              if (treeOid) {
                commitOptions.tree = treeOid
              }

              const orphanCommitOid = await git.commit(commitOptions)

              console.log("[forkAndCloneRepo] Created orphan commit:", orphanCommitOid)

              // Update the branch to point to the orphan commit
              await git.writeRef({
                dir: workingDir,
                ref: `refs/heads/${defaultBranch}`,
                value: orphanCommitOid,
                force: true,
              })

              // Try pushing the orphan commit
              await runTimed(
                "push orphan commit",
                FORK_TIMEOUTS.pushMs,
                () =>
                  git.push({
                    dir: workingDir,
                    url: forkUrl,
                    ref: defaultBranch,
                    remoteRef: `refs/heads/${defaultBranch}`,
                    force: true,
                    onAuth: () =>
                      provider === "gitlab"
                        ? {username: "oauth2", password: token}
                        : {username: "token", password: token},
                  }),
                {forkUrl, defaultBranch},
              )

              console.log("[forkAndCloneRepo] Push of orphan commit successful")
              pushSuccess = true
            } catch (orphanError: any) {
              console.error(
                "[forkAndCloneRepo] Failed to create/push orphan commit:",
                orphanError?.message,
              )
              // Continue to throw the original error
            }
          }

          if (!pushSuccess && attempt < maxPushRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt))
          }
        }
      }

      if (!pushSuccess) {
        console.error("[forkAndCloneRepo] All push attempts failed:", lastPushError?.message)
        throw new Error(
          `Failed to push to new repository after ${maxPushRetries} attempts: ${lastPushError?.message}`,
        )
      }

      // Clean up the fork-target remote
      await git.deleteRemote({dir: workingDir, remote: "fork-target"}).catch(() => {})

      // Use workingDir for metadata gathering
      metadataDir = workingDir
    } else {
      // Standard same-platform fork
      // Check if the fork name was honored
      if (forkResult!.name !== forkName) {
        throw new Error(
          `Fork already exists with name "${forkResult!.name}". Please delete the existing fork first or choose a different name.`,
        )
      }

      forkOwnerLogin = forkResult!.owner.login
      forkUrl = forkResult!.cloneUrl
      console.log("[forkAndCloneRepo] Fork created", {forkOwner: forkOwnerLogin, forkUrl})

      onProgress?.("Waiting for fork to be ready...", 30)

      // Poll until fork is ready
      let pollAttempts = 0
      const maxPollAttempts = 30

      while (pollAttempts < maxPollAttempts) {
        try {
          const repoMetadata = await runTimed(
            "getRepo (poll)",
            FORK_TIMEOUTS.getRepoMs,
            () => gitServiceApi.getRepo(forkOwnerLogin, forkName),
            {attempt: pollAttempts + 1, max: maxPollAttempts, forkOwnerLogin, forkName},
          )
          if (repoMetadata?.id) break
        } catch (error: any) {
          if (!error.message?.includes("404") && !error.message?.includes("Not Found")) {
            throw error
          }
        }

        pollAttempts++
        onProgress?.(
          `Waiting for fork... (${pollAttempts}/${maxPollAttempts})`,
          30 + (pollAttempts / maxPollAttempts) * 20,
        )
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      if (pollAttempts >= maxPollAttempts) {
        throw new Error("Fork creation timed out. The fork may still be processing.")
      }

      onProgress?.("Cloning fork locally...", 60)

      // Clone the fork locally
      const cloneUrl =
        provider === "grasp"
          ? forkUrl.replace("ws://", "http://").replace("wss://", "https://")
          : forkUrl

      const forkCloneStartedAt = Date.now()
      console.log("[forkAndCloneRepo] Cloning fork locally:", {cloneUrl, dir: absoluteDir})
      await cloneRemoteRepoUtil(git, cacheManager, {
        url: cloneUrl,
        dir: absoluteDir,
        depth: 50, // Use shallow clone to avoid hanging on large repos
        token,
        onProgress: (message: string, percentage?: number) => {
          onProgress?.(message, 60 + (percentage || 0) * 0.35)
        },
      })
      console.log(
        "[forkAndCloneRepo] Fork clone completed in",
        `${Date.now() - forkCloneStartedAt}ms`,
      )
    }

    onProgress?.("Gathering repository metadata...", 95)

    // Get repository metadata (use metadataDir which may be existing local clone for cross-platform forks)
    let defaultBranch = fallbackMetadata?.defaultBranch
    let branches = fallbackMetadata?.branches
    let tags = fallbackMetadata?.tags
    try {
      defaultBranch = await resolveRobustBranch(git, metadataDir)
      branches = await git.listBranches({dir: metadataDir})
      tags = await git.listTags({dir: metadataDir})
    } catch (metaErr: any) {
      console.warn(
        "[forkAndCloneRepo] Failed to load metadata after push, using fallback:",
        metaErr?.message,
      )
      if (!defaultBranch) defaultBranch = "main"
      if (!branches) branches = defaultBranch ? [defaultBranch] : []
      if (!tags) tags = []
    }

    if (workflowRestoreState) {
      try {
        await git.writeRef({
          dir: workflowRestoreState.dir,
          ref: `refs/heads/${workflowRestoreState.branch}`,
          value: workflowRestoreState.head,
          force: true,
        })
        await git.checkout({dir: workflowRestoreState.dir, ref: workflowRestoreState.branch})
      } catch (restoreErr: any) {
        console.warn(
          "[forkAndCloneRepo] Failed to restore workflow files after fork:",
          restoreErr?.message,
        )
      }
    }

    const finalDefaultBranch = defaultBranch || "main"
    const finalBranches = branches ?? (finalDefaultBranch ? [finalDefaultBranch] : [])
    const finalTags = tags ?? []

    onProgress?.("Fork completed successfully!", 100)

    return {
      success: true,
      repoId: `${forkOwnerLogin}/${forkName}`,
      forkUrl,
      defaultBranch: finalDefaultBranch,
      branches: finalBranches,
      tags: finalTags,
    }
  } catch (error: any) {
    console.error("Fork and clone failed:", error)

    if (workflowRestoreState) {
      try {
        await git.writeRef({
          dir: workflowRestoreState.dir,
          ref: `refs/heads/${workflowRestoreState.branch}`,
          value: workflowRestoreState.head,
          force: true,
        })
        await git.checkout({dir: workflowRestoreState.dir, ref: workflowRestoreState.branch})
      } catch (restoreErr: any) {
        console.warn(
          "[forkAndCloneRepo] Failed to restore workflow files after error:",
          restoreErr?.message,
        )
      }
    }

    // Cleanup partial clone on error
    try {
      const fs: any = (git as any).fs
      await fs?.promises?.rmdir?.(dir, {recursive: true}).catch?.(() => {})
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      repoId: "",
      forkUrl: "",
      defaultBranch: "",
      branches: [],
      tags: [],
      error: error.message || "Fork operation failed",
    }
  }
}

// ============================================================================
// Repository Update Functions
// ============================================================================

export interface UpdateRemoteRepoMetadataOptions {
  owner: string
  repo: string
  updates: {
    name?: string
    description?: string
    private?: boolean
  }
  token: string
  provider?: GitVendor
}

export interface UpdateRemoteRepoMetadataResult {
  success: boolean
  updatedRepo?: any
  error?: string
}

export interface DeleteRemoteRepoOptions {
  remoteUrl: string
  token: string
}

export interface DeleteRemoteRepoResult {
  success: boolean
  error?: string
}

/**
 * Update remote repository metadata via Git provider API
 */
export async function updateRemoteRepoMetadata(
  options: UpdateRemoteRepoMetadataOptions,
): Promise<UpdateRemoteRepoMetadataResult> {
  const {owner, repo, updates, token, provider = "github"} = options

  try {
    console.log(`Updating remote repository metadata for ${owner}/${repo}...`)

    const api = getGitServiceApi(provider, token)
    const updatedRepo = await api.updateRepo(owner, repo, {
      name: updates.name,
      description: updates.description,
      private: updates.private,
    })

    console.log(`Successfully updated remote repository metadata`)

    return {success: true, updatedRepo}
  } catch (error: any) {
    console.error("Update remote repository metadata failed:", error)
    return {
      success: false,
      error: error.message || "Failed to update repository metadata",
    }
  }
}

/**
 * Delete a remote repository via Git provider API
 */
export async function deleteRemoteRepo(
  options: DeleteRemoteRepoOptions,
): Promise<DeleteRemoteRepoResult> {
  const {remoteUrl, token} = options

  try {
    const parsed = parseRepoFromUrl(remoteUrl)
    if (!parsed) {
      throw new Error("Unable to parse repository URL")
    }
    const {provider, owner, repo} = parsed
    await provider.deleteRepo(owner, repo, token)
    return {success: true}
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || "Failed to delete repository",
    }
  }
}

// ============================================================================
// File Update Functions
// ============================================================================

export interface UpdateAndPushFilesOptions {
  dir: string
  files: Array<{path: string; content: string}>
  commitMessage: string
  token: string
  provider?: GitVendor
  onProgress?: (stage: string) => void
}

export interface UpdateAndPushFilesResult {
  success: boolean
  commitId?: string
  error?: string
}

/**
 * Update and push files to a repository
 */
export async function updateAndPushFiles(
  git: GitProvider,
  options: UpdateAndPushFilesOptions,
): Promise<UpdateAndPushFilesResult> {
  const {dir, files, commitMessage, token, provider = "github", onProgress} = options

  try {
    onProgress?.("Updating local files...")

    const fs = getProviderFs(git)
    if (!fs?.promises) {
      throw new Error("Filesystem not available from Git provider")
    }

    for (const file of files) {
      const filePath = `${dir}/${file.path}`
      const dirPath = filePath.substring(0, filePath.lastIndexOf("/"))
      if (dirPath && dirPath !== dir) {
        await fs.promises.mkdir(dirPath, {recursive: true}).catch(() => {})
      }
      await fs.promises.writeFile(filePath, file.content, "utf8")
    }

    onProgress?.("Staging changes...")

    for (const file of files) {
      await git.add({dir, filepath: file.path})
    }

    onProgress?.("Creating commit...")

    const commitResult = await git.commit({
      dir,
      message: commitMessage,
      author: {name: "Nostr Git User", email: "user@nostr-git.dev"},
    })

    onProgress?.("Pushing to remote...")

    // Push with authentication
    const authCallback =
      provider === "grasp"
        ? () => ({username: token, password: "grasp"})
        : () => ({username: "token", password: token})

    await git.push({dir, onAuth: authCallback, force: false})

    onProgress?.("Files updated and pushed successfully!")

    return {success: true, commitId: commitResult}
  } catch (error: any) {
    console.error("Update and push files failed:", error)
    return {success: false, error: error.message || "Failed to update and push files"}
  }
}
