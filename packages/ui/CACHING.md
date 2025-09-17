# Caching and Performance Guide

## Overview

The Nostr-Git UI implements a sophisticated multi-level caching system designed to minimize network requests, reduce redundant git operations, and provide a responsive user experience. This document provides detailed technical information about the caching mechanisms and performance optimizations.

## Caching Layers

### 1. Memory Cache (L1)

**Purpose**: Ultra-fast access to frequently used data
**Lifetime**: Session-scoped, cleared on page refresh
**Storage**: JavaScript objects and Maps
**Use Cases**: Active repository data, current branch info, recent file listings

```typescript
// Example: Memory cache for active commits
const memoryCache = new Map<string, CommitInfo[]>();
```

### 2. Browser Storage Cache (L2)

**Purpose**: Persistent caching across sessions
**Lifetime**: Configurable TTL with automatic cleanup
**Storage**: localStorage, sessionStorage, IndexedDB
**Use Cases**: Merge analysis results, file content, repository metadata

```typescript
// Example: localStorage cache entry
{
  key: "file_content_repo123_main_README.md",
  data: { content: "...", size: 1024, encoding: "utf8" },
  timestamp: 1642694400000,
  ttl: 600000, // 10 minutes
  metadata: { branch: "main", path: "README.md" }
}
```

### 3. Progressive Git Data Loading (L3)

**Purpose**: Minimize initial git clone overhead
**Strategy**: Load only what's needed, when it's needed
**Levels**: refs → shallow → full

## Cache Configuration

### CacheManager Configuration

```typescript
interface CacheConfig {
  type: CacheType; // Storage backend
  keyPrefix: string; // Namespace prefix
  defaultTTL: number; // Default expiration time
  maxSize?: number; // Maximum cache size
  cleanupInterval?: number; // Cleanup frequency
  autoCleanup?: boolean; // Enable automatic cleanup
}

// Example configurations
const configs = {
  memory: {
    type: CacheType.MEMORY,
    keyPrefix: "nostr_git_memory",
    defaultTTL: 300000, // 5 minutes
    maxSize: 100,
    autoCleanup: true,
  },
  persistent: {
    type: CacheType.LOCAL_STORAGE,
    keyPrefix: "nostr_git_persistent",
    defaultTTL: 1800000, // 30 minutes
    cleanupInterval: 60000, // 1 minute
    autoCleanup: true,
  },
};
```

### Manager-Specific Cache Settings

#### FileManager Caching

```typescript
const fileManagerConfig = {
  caching: {
    enabled: true,
    contentTTL: 600000, // 10 minutes for file content
    listingTTL: 300000, // 5 minutes for directory listings
    historyTTL: 600000, // 10 minutes for file history
    existenceTTL: 300000, // 5 minutes for existence checks
    maxFileSize: 1048576, // 1MB max cached file size
  },
};
```

#### PatchManager Caching

```typescript
const patchManagerConfig = {
  mergeAnalysisCache: {
    ttl: 1800000, // 30 minutes
    keyPrefix: "merge_analysis_cache",
    storage: CacheType.LOCAL_STORAGE,
    validateContent: true, // Hash-based validation
    validateContext: true, // Repo/branch validation
  },
};
```

#### CommitManager Caching

```typescript
const commitManagerConfig = {
  caching: {
    historyTTL: 600000, // 10 minutes for commit history
    pageSize: 30, // Commits per page
    maxPages: 10, // Maximum cached pages
    preloadNext: true, // Preload next page
  },
};
```

## Cache Key Patterns

### Hierarchical Key Structure

Cache keys follow a consistent pattern for easy management and selective clearing:

```
{manager}_{operation}_{repo_id}_{context}_{identifier}
```

### Examples by Manager

#### FileManager Keys

```typescript
// File content
`file_content_${repoId}_${branch}_${path}`
// Example: "file_content_abc123_main_src/index.ts"

// Directory listing
`file_listing_${repoId}_${branch}_${path}`
// Example: "file_listing_abc123_main_src/"

// File history
`file_history_${repoId}_${branch}_${path}`
// Example: "file_history_abc123_main_README.md"

// File existence
`file_exists_${repoId}_${commit}_${path}`;
// Example: "file_exists_abc123_def456_package.json"
```

#### PatchManager Keys

```typescript
// Merge analysis
`merge_analysis_cache_${patchId}`;
// Example: "merge_analysis_cache_patch789"
```

#### CommitManager Keys

```typescript
// Commit history page
`commit_history_${repoId}_${branch}_${page}_${pageSize}`
// Example: "commit_history_abc123_main_1_30"

// Total commit count
`commit_count_${repoId}_${branch}`;
// Example: "commit_count_abc123_main"
```

## Cache Invalidation Strategies

### Time-Based Expiration

All cache entries include TTL (Time To Live) values:

```typescript
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  metadata?: any;
}

// Check if entry is expired
const isExpired = (entry: CacheEntry): boolean => {
  return Date.now() > entry.timestamp + entry.ttl;
};
```

### Content-Based Invalidation

For dynamic content that may change independently of time:

```typescript
// Patch content hash for change detection
const generatePatchHash = (patch: GitPatch): string => {
  const content = JSON.stringify({
    id: patch.id,
    title: patch.title,
    content: patch.content,
    targetBranch: patch.targetBranch,
    commits: patch.commits?.map((c) => c.id),
  });
  return btoa(content).slice(0, 16);
};

// Validate cached merge analysis
const isValidCache = (cached: MergeAnalysisCache, patch: GitPatch): boolean => {
  return (
    cached.hash === generatePatchHash(patch) &&
    cached.branch === patch.targetBranch &&
    cached.repoId === patch.repoId
  );
};
```

### Context-Based Invalidation

Cache entries are invalidated when their context changes:

```typescript
// Repository state changes
const invalidateRepoCache = (repoId: string) => {
  const patterns = [`file_*_${repoId}_*`, `commit_*_${repoId}_*`, `merge_analysis_*_${repoId}_*`];
  cacheManager.clearByPattern(patterns);
};

// Branch changes
const invalidateBranchCache = (repoId: string, branch: string) => {
  const patterns = [`file_*_${repoId}_${branch}_*`, `commit_*_${repoId}_${branch}_*`];
  cacheManager.clearByPattern(patterns);
};
```

## Performance Optimizations

### Background Processing

Expensive operations are performed in the background to avoid blocking the UI:

```typescript
// PatchManager background analysis
class PatchManager {
  private async processBackgroundAnalysis(patches: GitPatch[]) {
    const batchSize = 3;
    const staggerDelay = 100;

    for (let i = 0; i < patches.length; i += batchSize) {
      const batch = patches.slice(i, i + batchSize);

      // Process batch
      await Promise.all(batch.map((patch) => this.analyzeIfNeeded(patch)));

      // Stagger between batches
      if (i + batchSize < patches.length) {
        await new Promise((resolve) => setTimeout(resolve, staggerDelay));
      }
    }
  }
}
```

### Progressive Loading Strategy

Git repositories are loaded progressively to minimize initial load time:

```typescript
// WorkerManager progressive loading
enum RepoDataLevel {
  NONE = "none",
  REFS = "refs", // Branch/tag references only
  SHALLOW = "shallow", // HEAD commit + tree
  FULL = "full", // Complete history
}

class WorkerManager {
  async ensureDataLevel(repoId: string, required: RepoDataLevel) {
    const current = this.getRepoDataLevel(repoId);

    if (this.needsUpgrade(current, required)) {
      switch (required) {
        case RepoDataLevel.REFS:
          return this.initializeRepo(repoId);
        case RepoDataLevel.SHALLOW:
          return this.ensureShallowClone(repoId);
        case RepoDataLevel.FULL:
          return this.ensureFullClone(repoId);
      }
    }
  }
}
```

### Smart Preloading

Anticipate user actions and preload likely-needed data:

```typescript
// CommitManager preloading
class CommitManager {
  async loadPage(page: number) {
    const commits = await this.fetchCommitPage(page);

    // Preload next page if near the end
    if (this.config.preloadNext && page > 1) {
      this.preloadPage(page + 1);
    }

    return commits;
  }

  private async preloadPage(page: number) {
    // Non-blocking preload
    setTimeout(() => {
      this.fetchCommitPage(page).catch(() => {
        // Ignore preload failures
      });
    }, 100);
  }
}
```

## Cache Monitoring and Debugging

### Cache Statistics

Track cache performance metrics:

```typescript
interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
  memoryUsage?: number;
}

class CacheManager {
  getStats(cacheName: string): CacheStats {
    const cache = this.caches.get(cacheName);
    return {
      hits: cache.hits,
      misses: cache.misses,
      size: cache.size,
      hitRate: cache.hits / (cache.hits + cache.misses),
      memoryUsage: this.estimateMemoryUsage(cache),
    };
  }
}
```

### Debug Logging

Enable detailed cache logging in development:

```typescript
// Enable cache debugging
localStorage.setItem("nostr_git_debug_cache", "true");

// Cache operations will log:
// ✅ Cache HIT: file_content_abc123_main_README.md (45ms saved)
// ❌ Cache MISS: file_listing_abc123_main_src/ (fetching...)
// 🧹 Cache CLEANUP: Removed 5 expired entries
// 📊 Cache STATS: Hit rate 85% (42/49 requests)
```

### Performance Monitoring

Track cache effectiveness:

```typescript
// Monitor cache performance
const monitor = {
  trackCacheHit(key: string, savedTime: number) {
    console.log(`✅ Cache HIT: ${key} (${savedTime}ms saved)`);
  },

  trackCacheMiss(key: string, fetchTime: number) {
    console.log(`❌ Cache MISS: ${key} (${fetchTime}ms to fetch)`);
  },

  trackCacheCleanup(removed: number) {
    console.log(`🧹 Cache CLEANUP: Removed ${removed} expired entries`);
  },
};
```

## Best Practices

### Cache Sizing

- **Memory Cache**: Keep small (< 100 entries) for active data
- **Persistent Cache**: Larger limits (< 50MB) for long-term storage
- **File Content**: Limit cached file size (< 1MB) to prevent memory issues

### TTL Guidelines

- **Frequently Changing**: 5-10 minutes (file listings, branch refs)
- **Moderately Stable**: 10-30 minutes (file content, commit history)
- **Stable Data**: 30-60 minutes (merge analysis, repository metadata)

### Error Handling

- Always provide fallbacks when cache operations fail
- Don't let cache errors break core functionality
- Log cache errors for debugging but handle gracefully

### Memory Management

- Implement proper cleanup in component disposal
- Use weak references where appropriate
- Monitor memory usage in development

## Troubleshooting

### Common Issues

#### Cache Not Working

```typescript
// Check if caching is enabled
console.log("Cache enabled:", manager.config.caching?.enabled);

// Check cache statistics
console.log("Cache stats:", cacheManager.getStats("file_content"));

// Verify cache keys
console.log("Cache keys:", cacheManager.listKeys("file_content"));
```

#### High Memory Usage

```typescript
// Check cache sizes
Object.entries(cacheManager.caches).forEach(([name, cache]) => {
  console.log(`${name}: ${cache.size} entries`);
});

// Force cleanup
cacheManager.cleanup();

// Reduce cache limits
cacheManager.configure({ maxSize: 50 });
```

#### Stale Data

```typescript
// Check TTL settings
console.log("TTL config:", manager.config.caching?.contentTTL);

// Force refresh
cacheManager.clear("file_content");
await manager.refreshData();

// Verify cache invalidation
cacheManager.clearByPattern(`*_${repoId}_*`);
```

## Future Enhancements

### Planned Improvements

- **Service Worker Integration**: Offline support and background sync
- **Predictive Caching**: Machine learning-based preloading
- **Compression**: Compress large cache entries
- **Distributed Caching**: Share cache across browser tabs
- **Cache Analytics**: Detailed performance metrics and optimization suggestions

### Advanced Features

- **Cache Warming**: Preload critical data on app startup
- **Smart Eviction**: LRU and priority-based cache eviction
- **Cache Synchronization**: Keep cache consistent across components
- **Performance Budgets**: Automatic cache tuning based on device capabilities
