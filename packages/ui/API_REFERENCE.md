# API Reference Guide

## Overview

This document provides a comprehensive API reference for the Nostr-Git UI components, focusing on the refactored `Repo` class and its manager components. All APIs are fully typed with TypeScript for excellent developer experience.

## Core Classes

### Repo Class

The main entry point for git repository operations, coordinating between specialized manager components.

#### Constructor

```typescript
constructor(config: RepoConfig)

interface RepoConfig {
  repoEvent: GitRepoEvent;
  repoStateEvent?: GitRepoStateEvent;
  issues?: GitIssue[];
  patches?: GitPatch[];
  relayList?: string[];
}
```

#### Properties

```typescript
// Reactive state (Svelte 5 runes)
readonly repoEvent: GitRepoEvent;
readonly repoStateEvent: GitRepoStateEvent | null;
readonly issues: GitIssue[];
readonly patches: GitPatch[];

// Computed properties
readonly repoId: string;
readonly name: string;
readonly description: string;
readonly cloneUrls: string[];
readonly webUrls: string[];
readonly branches: string[];
readonly tags: string[];
readonly mainBranch: string;

// Manager instances
readonly workerManager: WorkerManager;
readonly cacheManager: CacheManager;
readonly patchManager: PatchManager;
readonly commitManager: CommitManager;
readonly branchManager: BranchManager;
readonly fileManager: FileManager;

// Commit state
readonly commits: GitCommit[];
readonly totalCommits: number;
readonly commitsPerPage: number;
readonly currentPage: number;
readonly isLoadingCommits: boolean;
readonly hasMoreCommits: boolean;
```

#### File Operations

```typescript
// List files and directories
async listRepoFiles(options: {
  branch?: string;
  path?: string;
  useCache?: boolean;
}): Promise<FileListingResult>

interface FileListingResult {
  files: FileInfo[];
  path: string;
  ref: string;
  fromCache: boolean;
}

interface FileInfo {
  path: string;
  type: 'file' | 'directory' | 'submodule' | 'symlink';
  size?: number;
  lastModified?: Date;
  mode?: string;
  lastCommit?: string;
}

// Get file content
async getFileContent(options: {
  path: string;
  branch?: string;
  commit?: string;
  useCache?: boolean;
}): Promise<FileContent>

interface FileContent {
  content: string;
  path: string;
  ref: string;
  size: number;
  encoding: string;
  fromCache: boolean;
}

// Check if file exists at specific commit/branch
async fileExistsAtCommit(options: {
  path: string;
  branch?: string;
  commit?: string;
  useCache?: boolean;
}): Promise<boolean>

// Get file commit history
async getFileHistory(options: {
  path: string;
  branch?: string;
  maxCount?: number;
  useCache?: boolean;
}): Promise<FileHistoryEntry[]>

interface FileHistoryEntry {
  commit: string;
  author: string;
  date: Date;
  message: string;
  changes: {
    added: number;
    deleted: number;
  };
}
```

#### Commit Operations

```typescript
// Load commit history page
async loadPage(page: number): Promise<void>

// Set commits per page
setCommitsPerPage(count: 10 | 30 | 50 | 100): void

// Load more commits (append to current list)
async loadMoreCommits(): Promise<void>

// Get specific commit information
async getCommitInfo(commitId: string): Promise<CommitInfo>

interface CommitInfo {
  id: string;
  author: string;
  email: string;
  date: Date;
  message: string;
  parents: string[];
  tree: string;
}
```

#### Patch Operations

```typescript
// Get cached merge analysis result
getMergeAnalysis(patchId: string): MergeAnalysisResult | null

// Check if merge analysis is available
hasMergeAnalysis(patchId: string): boolean

// Force refresh merge analysis
async refreshMergeAnalysis(patch: GitPatch): Promise<MergeAnalysisResult>

interface MergeAnalysisResult {
  canMerge: boolean;
  conflicts: string[];
  conflictFiles: string[];
  stats: {
    additions: number;
    deletions: number;
    files: number;
  };
  error?: string;
}
```

#### Branch Operations

```typescript
// Refresh branch and tag data
async refreshBranches(): Promise<void>

// Get branch commit count
async getBranchCommitCount(branch: string): Promise<number>

// Switch to different branch
async switchBranch(branch: string): Promise<void>
```

#### Cache Management

```typescript
// Clear all caches for this repository
async clearCache(): Promise<void>

// Clear specific cache type
async clearCacheType(type: 'files' | 'commits' | 'patches' | 'branches'): Promise<void>

// Get cache statistics
getCacheStats(): Record<string, CacheStats>

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
  memoryUsage?: number;
}
```

#### Lifecycle Management

```typescript
// Dispose of all resources
dispose(): void

// Check if repository is ready
isReady(): boolean

// Wait for repository to be ready
async waitForReady(): Promise<void>
```

## Manager Components

### WorkerManager

Handles all git worker operations and communication.

```typescript
class WorkerManager {
  constructor(config?: WorkerConfig);

  // Initialize repository with minimal data
  async initializeRepo(repoEvent: GitRepoEvent): Promise<void>;

  // Ensure shallow clone (HEAD + tree)
  async ensureShallowClone(repoEvent: GitRepoEvent, branch?: string): Promise<void>;

  // Ensure full clone (complete history)
  async ensureFullClone(repoEvent: GitRepoEvent, depth?: number): Promise<void>;

  // Get current repository data level
  getRepoDataLevel(repoId: string): RepoDataLevel;

  // Execute git operation
  async executeGitOperation(operation: GitOperation): Promise<any>;

  // Dispose worker resources
  dispose(): void;
}

enum RepoDataLevel {
  NONE = "none",
  REFS = "refs",
  SHALLOW = "shallow",
  FULL = "full",
}
```

### CacheManager

Unified caching system supporting multiple storage backends.

```typescript
class CacheManager {
  constructor(config: CacheConfig);

  // Get cached data
  async get<T>(cacheName: string, key: string): Promise<T | null>;

  // Set cached data
  async set<T>(
    cacheName: string,
    key: string,
    data: T,
    ttl?: number,
    metadata?: any
  ): Promise<void>;

  // Remove cached entry
  async remove(cacheName: string, key: string): Promise<void>;

  // Clear entire cache
  async clear(cacheName: string): Promise<void>;

  // Clear by pattern
  async clearByPattern(pattern: string): Promise<void>;

  // Cleanup expired entries
  async cleanup(): Promise<number>;

  // Get cache statistics
  getStats(cacheName: string): CacheStats;

  // List cache keys
  listKeys(cacheName: string): string[];
}

interface CacheConfig {
  type: CacheType;
  keyPrefix: string;
  defaultTTL: number;
  maxSize?: number;
  cleanupInterval?: number;
  autoCleanup?: boolean;
}

enum CacheType {
  MEMORY = "memory",
  LOCAL_STORAGE = "localStorage",
  SESSION_STORAGE = "sessionStorage",
  INDEXED_DB = "indexedDB",
}
```

### FileManager

Specialized manager for file system operations.

```typescript
class FileManager {
  constructor(
    workerManager: WorkerManager,
    cacheManager?: CacheManager,
    config?: FileManagerConfig
  );

  // List repository files
  async listRepoFiles(options: ListFilesOptions): Promise<FileListingResult>;

  // Get file content
  async getFileContent(options: GetFileContentOptions): Promise<FileContent>;

  // Check file existence
  async fileExistsAtCommit(options: FileExistsOptions): Promise<boolean>;

  // Get file history
  async getFileHistory(options: FileHistoryOptions): Promise<FileHistoryEntry[]>;

  // Clear file caches
  async clearCache(repoId?: string): Promise<void>;

  // Dispose resources
  dispose(): void;
}

interface FileManagerConfig {
  caching?: {
    enabled?: boolean;
    contentTTL?: number;
    listingTTL?: number;
    historyTTL?: number;
    existenceTTL?: number;
    maxFileSize?: number;
  };
}
```

### CommitManager

Manages commit history and pagination.

```typescript
class CommitManager {
  constructor(
    workerManager: WorkerManager,
    cacheManager?: CacheManager,
    config?: CommitManagerConfig
  );

  // Load commit page
  async loadPage(repoEvent: GitRepoEvent, page: number, branch?: string): Promise<GitCommit[]>;

  // Get total commit count
  async getTotalCommits(repoEvent: GitRepoEvent, branch?: string): Promise<number>;

  // Set page size
  setPageSize(size: number): void;

  // Clear commit caches
  async clearCache(repoId?: string): Promise<void>;

  // Dispose resources
  dispose(): void;
}

interface CommitManagerConfig {
  defaultPageSize?: number;
  maxPageSize?: number;
  caching?: {
    historyTTL?: number;
    maxPages?: number;
    preloadNext?: boolean;
  };
}
```

### PatchManager

Handles patch operations and merge analysis.

```typescript
class PatchManager {
  constructor(
    workerManager: WorkerManager,
    cacheManager?: CacheManager,
    config?: PatchManagerConfig
  );

  // Get merge analysis (cached)
  getMergeAnalysis(patchId: string): MergeAnalysisResult | null;

  // Check if analysis exists
  hasMergeAnalysis(patchId: string): boolean;

  // Analyze patch merge
  async analyzeMerge(patch: GitPatch, repoEvent: GitRepoEvent): Promise<MergeAnalysisResult>;

  // Process patches in background
  async processBackgroundAnalysis(patches: GitPatch[], repoEvent: GitRepoEvent): Promise<void>;

  // Clear patch caches
  async clearCache(repoId?: string): Promise<void>;

  // Dispose resources
  dispose(): void;
}

interface PatchManagerConfig {
  backgroundProcessing?: {
    enabled?: boolean;
    batchSize?: number;
    staggerDelay?: number;
  };
  mergeAnalysisCache?: {
    ttl?: number;
    validateContent?: boolean;
    validateContext?: boolean;
  };
}
```

### BranchManager

Manages branch operations and NIP-34 compliance.

```typescript
class BranchManager {
  constructor(workerManager: WorkerManager, config?: BranchManagerConfig);

  // Get branches from repository state
  getBranches(): string[];

  // Get tags from repository state
  getTags(): string[];

  // Get main branch
  getMainBranch(): string;

  // Refresh branch data
  async refreshBranches(repoEvent: GitRepoEvent): Promise<void>;

  // Convert NIP-34 ref to git ref
  nip34ToGitRef(nip34Ref: string): string;

  // Convert git ref to NIP-34 ref
  gitRefToNip34(gitRef: string): string;

  // Dispose resources
  dispose(): void;
}

interface BranchManagerConfig {
  autoRefresh?: boolean;
  refreshInterval?: number;
}
```

## Type Definitions

### Core Types

```typescript
// Git repository event (NIP-34)
interface GitRepoEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: 30617;
  tags: string[][];
  content: string;
}

// Git repository state event (NIP-34)
interface GitRepoStateEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: 30618;
  tags: string[][];
  content: string;
}

// Git commit
interface GitCommit {
  id: string;
  author: string;
  email: string;
  date: Date;
  message: string;
  parents: string[];
  tree: string;
}

// Git patch
interface GitPatch {
  id: string;
  repoId: string;
  title: string;
  content: string;
  targetBranch: string;
  commits?: GitCommit[];
  author: string;
  created_at: Date;
}

// Git issue
interface GitIssue {
  id: string;
  repoId: string;
  title: string;
  content: string;
  state: "open" | "closed";
  author: string;
  created_at: Date;
  labels?: string[];
}
```

### Configuration Types

```typescript
// Main repository configuration
interface RepoConfig {
  repoEvent: GitRepoEvent;
  repoStateEvent?: GitRepoStateEvent;
  issues?: GitIssue[];
  patches?: GitPatch[];
  relayList?: string[];

  // Manager configurations
  workerConfig?: WorkerConfig;
  cacheConfig?: CacheConfig;
  fileManagerConfig?: FileManagerConfig;
  commitManagerConfig?: CommitManagerConfig;
  patchManagerConfig?: PatchManagerConfig;
  branchManagerConfig?: BranchManagerConfig;
}

// Worker configuration
interface WorkerConfig {
  workerUrl?: string;
  timeout?: number;
  maxRetries?: number;
  progressCallback?: (progress: ProgressEvent) => void;
}
```

## Usage Examples

### Basic Repository Setup

```typescript
import { Repo } from "@nostr-git/ui";

// Create repository instance
const repo = new Repo({
  repoEvent,
  repoStateEvent,
  issues,
  patches,
});

// Wait for initialization
await repo.waitForReady();

// Access reactive state
console.log("Repository name:", repo.name);
console.log("Available branches:", repo.branches);
```

### File Operations

```typescript
// List files in directory
const listing = await repo.listRepoFiles({
  branch: "main",
  path: "src/",
  useCache: true,
});

console.log("Files:", listing.files);
console.log("From cache:", listing.fromCache);

// Get file content
const content = await repo.getFileContent({
  path: "README.md",
  branch: "main",
});

console.log("Content:", content.content);
console.log("Size:", content.size);

// Check file existence
const exists = await repo.fileExistsAtCommit({
  path: "package.json",
  commit: "abc123",
});

console.log("File exists:", exists);
```

### Commit History

```typescript
// Load first page of commits
await repo.loadPage(1);
console.log("Commits:", repo.commits);
console.log("Total:", repo.totalCommits);

// Configure page size
repo.setCommitsPerPage(50);

// Load more commits
await repo.loadMoreCommits();
```

### Patch Analysis

```typescript
// Check if analysis is available
if (repo.hasMergeAnalysis(patchId)) {
  const analysis = repo.getMergeAnalysis(patchId);
  console.log("Can merge:", analysis.canMerge);
  console.log("Conflicts:", analysis.conflicts);
} else {
  // Force analysis
  const analysis = await repo.refreshMergeAnalysis(patch);
  console.log("Analysis complete:", analysis);
}
```

#### Automatic Background Merge Analysis (Optional)

The `Repo` class can optionally perform **background merge analysis** for all patches when a repository is initialized, when patches change, or after a reset. This behavior is **disabled by default** to avoid expensive analysis work on first load.

To enable background merge analysis for a given `Repo` instance:

```typescript
// After constructing Repo
const repo = new Repo(config);

// Opt in to background merge analysis of all patches
repo.enableAutoMergeAnalysis();
```

When enabled, `Repo` will coordinate with `PatchManager` to process patches in the background using the worker, populating merge analysis results proactively. Manual analysis via the patch detail page or explicit calls to `refreshMergeAnalysis` continue to work regardless of this flag.

### Cache Management

```typescript
// Get cache statistics
const stats = repo.getCacheStats();
console.log("Cache stats:", stats);

// Clear specific cache
await repo.clearCacheType("files");

// Clear all caches
await repo.clearCache();
```

### Advanced Manager Usage

```typescript
// Direct manager access for advanced operations
const fileManager = repo.fileManager;

// Configure file manager
await fileManager.clearCache(repo.repoId);

// Direct cache manager usage
const cacheManager = repo.cacheManager;
await cacheManager.set("custom_cache", "key", data, 600000);
const cached = await cacheManager.get("custom_cache", "key");
```

## Error Handling

### Common Error Types

```typescript
// Repository not ready
if (!repo.isReady()) {
  await repo.waitForReady();
}

// File not found
try {
  const content = await repo.getFileContent({ path: "missing.txt" });
} catch (error) {
  if (error.code === "FILE_NOT_FOUND") {
    console.log("File does not exist");
  }
}

// Network errors
try {
  await repo.loadPage(1);
} catch (error) {
  if (error.code === "NETWORK_ERROR") {
    console.log("Network request failed");
  }
}

// Cache errors (graceful degradation)
try {
  const listing = await repo.listRepoFiles({ useCache: true });
} catch (error) {
  // Cache errors don't break functionality
  console.log("Cache error, but data still loaded:", listing);
}
```

### Best Practices

```typescript
// Always dispose resources
const repo = new Repo(config);
try {
  // Use repository
} finally {
  repo.dispose();
}

// Handle loading states
if (repo.isLoadingCommits) {
  console.log("Loading commits...");
}

// Check data availability
if (repo.hasMoreCommits) {
  await repo.loadMoreCommits();
}

// Use caching appropriately
const content = await repo.getFileContent({
  path: "large-file.txt",
  useCache: false, // Skip cache for large files
});
```

## Migration from Legacy API

### Breaking Changes

```typescript
// OLD: Direct file content return
const content = await repo.getFileContent("README.md");

// NEW: Structured return object
const result = await repo.getFileContent({ path: "README.md" });
const content = result.content;

// OLD: resetRepo method
repo.resetRepo();

// NEW: Clear cache methods
await repo.clearCache();

// OLD: Direct property access
const commits = repo._commits;

// NEW: Reactive properties
const commits = repo.commits;
```

### Compatibility Layer

```typescript
// Legacy wrapper for backward compatibility
class LegacyRepoWrapper {
  constructor(private repo: Repo) {}

  async getFileContent(path: string): Promise<string> {
    const result = await this.repo.getFileContent({ path });
    return result.content;
  }

  resetRepo(): void {
    this.repo.clearCache();
  }
}
```

This API reference provides comprehensive documentation for developers working with the refactored Nostr-Git UI components. The composition-based architecture offers powerful capabilities while maintaining a clean, intuitive API surface.
