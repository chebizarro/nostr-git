/**
 * Repository Management Functions
 *
 * Functions for creating, forking, and managing git repositories.
 * These are extracted from the legacy worker to keep the main worker clean.
 */

import type { GitProvider } from "../../git/provider.js";
import type { GitVendor } from "../../git/vendor-providers.js";
import { getGitServiceApi } from "../../git/provider-factory.js";
import { getProviderFs, ensureDir } from "./fs-utils.js";
import { cloneRemoteRepoUtil } from "./repos.js";
import { resolveBranchName as resolveRobustBranch } from "./branches.js";
import { parseRepoId } from "../../utils/repo-id.js";

// Helper to generate canonical repo key from repoId
function canonicalRepoKey(repoId: string): string {
  // Use parseRepoId to normalize, then make filesystem-safe
  try {
    const normalized = parseRepoId(repoId);
    return normalized.replace(/[^a-zA-Z0-9_\-\/]/g, "_");
  } catch {
    return repoId.replace(/[^a-zA-Z0-9_\-\/]/g, "_");
  }
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
};

/**
 * Get .gitignore template content for various languages/frameworks
 */
export async function getGitignoreTemplate(template: string): Promise<string> {
  return GITIGNORE_TEMPLATES[template] || "";
}

/**
 * Get license template content
 */
export async function getLicenseTemplate(
  template: string,
  authorName: string
): Promise<string> {
  const currentYear = new Date().getFullYear();

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
  };

  return templates[template] || "";
}

// ============================================================================
// Repository Creation Functions
// ============================================================================

export interface CreateLocalRepoOptions {
  repoId: string;
  name: string;
  description?: string;
  defaultBranch?: string;
  initializeWithReadme?: boolean;
  gitignoreTemplate?: string;
  licenseTemplate?: string;
  authorName: string;
  authorEmail: string;
}

export interface CreateLocalRepoResult {
  success: boolean;
  repoId: string;
  commitSha?: string;
  files?: string[];
  error?: string;
}

/**
 * Create a new local git repository with initial files
 */
export async function createLocalRepo(
  git: GitProvider,
  rootDir: string,
  clonedRepos: Set<string>,
  repoDataLevels: Map<string, string>,
  options: CreateLocalRepoOptions
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
  } = options;

  const key = canonicalRepoKey(repoId);
  const dir = `${rootDir}/${key}`;

  try {
    console.log(`Creating local repository: ${name}`);

    // Initialize git repository
    await git.init({ dir, defaultBranch });

    // Create initial files based on options
    const files: Array<{ path: string; content: string }> = [];

    // README.md
    if (initializeWithReadme) {
      const readmeContent = `# ${name}\n\n${description || "A new repository created with Flotilla-Budabit"}\n`;
      files.push({ path: "README.md", content: readmeContent });
    }

    // .gitignore
    if (gitignoreTemplate !== "none") {
      const gitignoreContent = await getGitignoreTemplate(gitignoreTemplate);
      if (gitignoreContent) {
        files.push({ path: ".gitignore", content: gitignoreContent });
      }
    }

    // LICENSE
    if (licenseTemplate !== "none") {
      const licenseContent = await getLicenseTemplate(licenseTemplate, authorName);
      if (licenseContent) {
        files.push({ path: "LICENSE", content: licenseContent });
      }
    }

    // Write files to repository
    const fs = getProviderFs(git);
    if (!fs || !fs.promises) {
      throw new Error("File system provider is not available");
    }

    for (const file of files) {
      const filePath = `${dir}/${file.path}`;

      // Ensure directory exists for nested files
      const pathParts = file.path.split("/");
      if (pathParts.length > 1) {
        const dirPath = pathParts.slice(0, -1).join("/");
        const fullDirPath = `${dir}/${dirPath}`;
        try {
          await ensureDir(fs, fullDirPath);
        } catch {
          // Directory might already exist
        }
      }

      await fs.promises.writeFile(filePath, file.content, "utf8");
      await git.add({ dir, filepath: file.path });
    }

    // Create initial commit
    const commitSha = await git.commit({
      dir,
      message: "Initial commit",
      author: { name: authorName, email: authorEmail },
    });

    // Update tracking
    clonedRepos.add(key);
    repoDataLevels.set(key, "full");

    console.log(`Local repository created successfully: ${commitSha}`);

    return {
      success: true,
      repoId,
      commitSha,
      files: files.map((f) => f.path),
    };
  } catch (error) {
    console.error(`Error creating local repository ${repoId}:`, error);
    return {
      success: false,
      repoId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Remote Repository Functions
// ============================================================================

export interface CreateRemoteRepoOptions {
  provider: GitVendor;
  token: string;
  name: string;
  description?: string;
  isPrivate?: boolean;
  baseUrl?: string;
}

export interface CreateRemoteRepoResult {
  success: boolean;
  remoteUrl?: string;
  provider?: GitVendor;
  error?: string;
}

/**
 * Create a remote repository on GitHub/GitLab/Gitea/GRASP
 */
export async function createRemoteRepo(
  options: CreateRemoteRepoOptions
): Promise<CreateRemoteRepoResult> {
  const { provider, token, name, description, isPrivate = false, baseUrl } = options;

  try {
    console.log(`Creating remote repository on ${provider}: ${name}`);

    if (!token || token.trim() === "") {
      throw new Error("No authentication token provided");
    }

    // Use GitServiceApi abstraction
    const api = getGitServiceApi(provider, token, baseUrl);

    // Create repository using unified API
    const repoMetadata = await api.createRepo({
      name,
      description,
      private: isPrivate,
      autoInit: false,
    });

    let remoteUrl = repoMetadata.cloneUrl;

    // For GRASP, ensure clone URL uses HTTP(S) scheme, not WS(S)
    if (provider === "grasp") {
      remoteUrl = remoteUrl.replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://");
    }

    console.log(`Remote repository created: ${remoteUrl}`);

    return { success: true, remoteUrl, provider };
  } catch (error) {
    console.error(`Error creating remote repository:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Fork Functions
// ============================================================================

export interface ForkAndCloneOptions {
  owner: string;
  repo: string;
  forkName: string;
  visibility: "public" | "private";
  token: string;
  dir: string;
  provider?: string;
  baseUrl?: string;
  onProgress?: (stage: string, pct?: number) => void;
}

export interface ForkAndCloneResult {
  success: boolean;
  repoId: string;
  forkUrl: string;
  defaultBranch: string;
  branches: string[];
  tags: string[];
  error?: string;
}

/**
 * Fork and clone a repository using Git provider API
 */
export async function forkAndCloneRepo(
  git: GitProvider,
  cacheManager: any,
  rootDir: string,
  options: ForkAndCloneOptions
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
    onProgress,
  } = options;

  try {
    onProgress?.("Creating remote fork...", 10);

    // Validate inputs
    if (!owner?.trim() || !repo?.trim() || !forkName?.trim()) {
      throw new Error(
        `Invalid parameters for fork: owner="${owner}", repo="${repo}", forkName="${forkName}"`
      );
    }

    console.log("[forkAndCloneRepo] Input params", { provider, baseUrl, owner, repo, forkName });

    // Create remote fork using GitServiceApi
    const gitServiceApi = getGitServiceApi(provider as GitVendor, token, baseUrl);

    let forkResult;
    try {
      forkResult = await gitServiceApi.forkRepo(owner, repo, { name: forkName });
    } catch (e: any) {
      console.error("[forkAndCloneRepo] forkRepo failed", { owner, repo, forkName, error: e?.message });
      throw e;
    }

    // Check if the fork name was honored
    if (forkResult.name !== forkName) {
      throw new Error(
        `Fork already exists with name "${forkResult.name}". Please delete the existing fork first or choose a different name.`
      );
    }

    const forkOwner = forkResult.owner;
    let forkUrl = forkResult.cloneUrl;
    console.log("[forkAndCloneRepo] Fork created", { forkOwner: forkOwner?.login, forkUrl });

    onProgress?.("Waiting for fork to be ready...", 30);

    // Poll until fork is ready
    let pollAttempts = 0;
    const maxPollAttempts = 30;

    while (pollAttempts < maxPollAttempts) {
      try {
        const repoMetadata = await gitServiceApi.getRepo(forkOwner.login, forkName);
        if (repoMetadata?.id) break;
      } catch (error: any) {
        if (!error.message?.includes("404") && !error.message?.includes("Not Found")) {
          throw error;
        }
      }

      pollAttempts++;
      onProgress?.(`Waiting for fork... (${pollAttempts}/${maxPollAttempts})`, 30 + (pollAttempts / maxPollAttempts) * 20);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (pollAttempts >= maxPollAttempts) {
      throw new Error("Fork creation timed out. The fork may still be processing.");
    }

    onProgress?.("Cloning fork locally...", 60);

    // Clone the fork locally
    const cloneUrl = provider === "grasp"
      ? forkUrl.replace("ws://", "http://").replace("wss://", "https://")
      : forkUrl;

    const absoluteDir = dir.startsWith("/") ? dir : `${rootDir}/${dir}`;

    await cloneRemoteRepoUtil(git, cacheManager, {
      url: cloneUrl,
      dir: absoluteDir,
      depth: 0,
      token,
      onProgress: (message: string, percentage?: number) => {
        onProgress?.(message, 60 + (percentage || 0) * 0.35);
      },
    });

    onProgress?.("Gathering repository metadata...", 95);

    // Get repository metadata
    const defaultBranch = await resolveRobustBranch(git, absoluteDir);
    const branches = await git.listBranches({ dir: absoluteDir });
    const tags = await git.listTags({ dir: absoluteDir });

    onProgress?.("Fork completed successfully!", 100);

    return {
      success: true,
      repoId: `${owner}/${forkName}`,
      forkUrl,
      defaultBranch,
      branches,
      tags,
    };
  } catch (error: any) {
    console.error("Fork and clone failed:", error);

    // Cleanup partial clone on error
    try {
      const fs: any = (git as any).fs;
      await fs?.promises?.rmdir?.(dir, { recursive: true }).catch?.(() => {});
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
    };
  }
}

// ============================================================================
// Repository Update Functions
// ============================================================================

export interface UpdateRemoteRepoMetadataOptions {
  owner: string;
  repo: string;
  updates: {
    name?: string;
    description?: string;
    private?: boolean;
  };
  token: string;
  provider?: GitVendor;
}

export interface UpdateRemoteRepoMetadataResult {
  success: boolean;
  updatedRepo?: any;
  error?: string;
}

/**
 * Update remote repository metadata via Git provider API
 */
export async function updateRemoteRepoMetadata(
  options: UpdateRemoteRepoMetadataOptions
): Promise<UpdateRemoteRepoMetadataResult> {
  const { owner, repo, updates, token, provider = "github" } = options;

  try {
    console.log(`Updating remote repository metadata for ${owner}/${repo}...`);

    const api = getGitServiceApi(provider, token);
    const updatedRepo = await api.updateRepo(owner, repo, {
      name: updates.name,
      description: updates.description,
      private: updates.private,
    });

    console.log(`Successfully updated remote repository metadata`);

    return { success: true, updatedRepo };
  } catch (error: any) {
    console.error("Update remote repository metadata failed:", error);
    return {
      success: false,
      error: error.message || "Failed to update repository metadata",
    };
  }
}

// ============================================================================
// File Update Functions
// ============================================================================

export interface UpdateAndPushFilesOptions {
  dir: string;
  files: Array<{ path: string; content: string }>;
  commitMessage: string;
  token: string;
  provider?: GitVendor;
  onProgress?: (stage: string) => void;
}

export interface UpdateAndPushFilesResult {
  success: boolean;
  commitId?: string;
  error?: string;
}

/**
 * Update and push files to a repository
 */
export async function updateAndPushFiles(
  git: GitProvider,
  options: UpdateAndPushFilesOptions
): Promise<UpdateAndPushFilesResult> {
  const { dir, files, commitMessage, token, provider = "github", onProgress } = options;

  try {
    onProgress?.("Updating local files...");

    const fs = getProviderFs(git);
    if (!fs?.promises) {
      throw new Error("Filesystem not available from Git provider");
    }

    for (const file of files) {
      const filePath = `${dir}/${file.path}`;
      const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
      if (dirPath && dirPath !== dir) {
        await fs.promises.mkdir(dirPath, { recursive: true }).catch(() => {});
      }
      await fs.promises.writeFile(filePath, file.content, "utf8");
    }

    onProgress?.("Staging changes...");

    for (const file of files) {
      await git.add({ dir, filepath: file.path });
    }

    onProgress?.("Creating commit...");

    const commitResult = await git.commit({
      dir,
      message: commitMessage,
      author: { name: "Nostr Git User", email: "user@nostr-git.dev" },
    });

    onProgress?.("Pushing to remote...");

    // Push with authentication
    const authCallback =
      provider === "grasp"
        ? () => ({ username: token, password: "grasp" })
        : () => ({ username: "token", password: token });

    await git.push({ dir, onAuth: authCallback, force: false });

    onProgress?.("Files updated and pushed successfully!");

    return { success: true, commitId: commitResult };
  } catch (error: any) {
    console.error("Update and push files failed:", error);
    return { success: false, error: error.message || "Failed to update and push files" };
  }
}
