# Nostr-Git UI Architecture Documentation

## Overview

The Nostr-Git UI package provides a comprehensive set of components for building git repository interfaces on top of the Nostr protocol. The architecture has been refactored from a monolithic `Repo` class into a composition-based system using specialized manager components.

## Architecture Principles

### Composition-Based Design
The core `Repo` class now acts as a coordinator that delegates specialized responsibilities to focused manager components:

- **Single Responsibility**: Each manager handles one specific domain
- **Loose Coupling**: Managers communicate through well-defined interfaces
- **High Cohesion**: Related functionality is grouped together
- **Testability**: Each manager can be tested independently
- **Maintainability**: Clear separation of concerns

### Manager Components

#### 1. WorkerManager
**Responsibility**: Git worker operations and communication
- Manages web worker lifecycle and communication
- Handles git operations (clone, fetch, commit history, file operations)
- Provides progress reporting and error handling
- Implements smart repository initialization with progressive loading

**Key Features**:
- Progressive loading strategy (refs → shallow → full)
- Smart caching to avoid redundant operations
- Background processing capabilities
- Proper resource cleanup and disposal

#### 2. CacheManager
**Responsibility**: Unified caching system
- Supports multiple cache types (memory, localStorage, sessionStorage, IndexedDB)
- Configurable cache policies (TTL, auto-cleanup, max size)
- Automatic expiration and cleanup
- Cache statistics and monitoring

**Cache Types**:
```typescript
enum CacheType {
  MEMORY = 'memory',
  LOCAL_STORAGE = 'localStorage', 
  SESSION_STORAGE = 'sessionStorage',
  INDEXED_DB = 'indexedDB'
}
```

**Configuration**:
```typescript
interface CacheConfig {
  type: CacheType;
  keyPrefix: string;
  defaultTTL: number;
  maxSize?: number;
  cleanupInterval?: number;
}
```

#### 3. PatchManager
**Responsibility**: Patch operations and merge analysis coordination
- Background merge analysis processing
- Cache coordination for analysis results
- Batch processing with staggered execution
- Integration with CacheManager for persistent storage

**Background Processing**:
- Processes patches in batches (3 at a time)
- 100ms stagger between batches to prevent blocking
- Cache-first approach for performance
- Error resilience and recovery

#### 4. CommitManager
**Responsibility**: Commit history and pagination
- Lazy-loaded commit history with pagination
- Configurable page sizes and depth limits
- Integration with WorkerManager for git operations
- State management for loading and error states

**Pagination Features**:
- Configurable commits per page (10, 30, 50, 100)
- Progressive loading with "load more" functionality
- Total commit count tracking
- Branch-specific commit filtering

#### 5. BranchManager
**Responsibility**: Branch operations and NIP-34 compliance
- Branch and tag management
- NIP-34 reference mapping (full refs ↔ short names)
- Repository state event parsing
- Auto-refresh capabilities

**NIP-34 Integration**:
```typescript
// Maps between formats
'refs/heads/main' ↔ 'main'
'refs/tags/v1.0.0' ↔ 'v1.0.0'
```

#### 6. FileManager
**Responsibility**: File system operations
- File listing and directory browsing
- File content retrieval with caching
- File existence checking
- File history tracking
- Intelligent caching with size limits and TTL

**Caching Strategy**:
- Content cache: 10 minutes TTL, 1MB max file size
- Listing cache: 5 minutes TTL
- History cache: 10 minutes TTL
- Existence cache: 5 minutes TTL

## Caching Architecture

### Multi-Level Caching Strategy

#### Level 1: Memory Cache
- Fastest access for frequently used data
- Automatic cleanup on memory pressure
- Session-scoped lifetime

#### Level 2: Browser Storage
- **localStorage**: Persistent across sessions
- **sessionStorage**: Session-scoped
- **IndexedDB**: Large data storage with structured queries

#### Level 3: Progressive Loading
- **Refs Only**: Minimal initial load for branch listing
- **Shallow Clone**: HEAD commit + tree for file operations
- **Full Clone**: Complete history for advanced operations

### Cache Invalidation

#### Time-Based Expiration
- Configurable TTL per cache type
- Automatic cleanup of expired entries
- Background cleanup processes

#### Content-Based Invalidation
- Hash-based change detection for patches
- Repository state change detection
- Branch/commit reference updates

#### Manual Invalidation
- Explicit cache clearing methods
- Repository reset functionality
- Selective cache pattern clearing

### Cache Key Structure

Cache keys follow a hierarchical pattern for granular control:

```
{cache_type}_{repo_id}_{ref}_{path}
```

Examples:
- `file_content_abc123_main_README.md`
- `file_listing_abc123_main_src/`
- `merge_analysis_cache_patch456`

## Performance Optimizations

### Background Processing
- Merge analysis runs in background when repos load
- Batch processing prevents UI blocking
- Staggered execution for system stability

### Smart Loading
- Progressive git data loading (refs → shallow → full)
- On-demand data fetching based on user actions
- Intelligent caching prevents redundant operations

### Memory Management
- Automatic disposal of manager resources
- Proper cleanup of event listeners and timers
- Memory cache size limits and eviction policies

## Usage Patterns

### Basic Repository Setup
```typescript
import { Repo } from '@nostr-git/ui';

const repo = new Repo({
  repoEvent,
  repoStateEvent,
  issues,
  patches
});

// Managers are automatically initialized and configured
```

### File Operations
```typescript
// List files (uses FileManager with caching)
const files = await repo.listRepoFiles({ 
  branch: 'main', 
  path: 'src/' 
});

// Get file content (uses FileManager with caching)
const content = await repo.getFileContent({ 
  path: 'README.md',
  branch: 'main' 
});

// Check file existence
const exists = await repo.fileExistsAtCommit({
  path: 'package.json',
  commit: 'abc123'
});
```

### Commit Operations
```typescript
// Load commits with pagination (uses CommitManager)
await repo.loadPage(1);
const commits = repo.commits;
const totalCommits = repo.totalCommits;

// Configure page size
repo.setCommitsPerPage(50);
```

### Branch Operations
```typescript
// Get branches (uses BranchManager with NIP-34 mapping)
const branches = repo.branches;
const mainBranch = repo.mainBranch;

// Refresh branch data
await repo.branchManager.refreshBranches();
```

### Patch Operations
```typescript
// Get merge analysis (uses PatchManager with caching)
const analysis = await repo.getMergeAnalysis(patchId);

// Check if analysis is available
const hasAnalysis = repo.hasMergeAnalysis(patchId);

// Force refresh analysis
await repo.refreshMergeAnalysis(patch);
```

## Error Handling

### Graceful Degradation
- Cache failures don't break functionality
- Network errors handled with retries
- Progressive fallback strategies

### Error Recovery
- Automatic retry mechanisms
- Exponential backoff for failed operations
- User-friendly error messages

### Logging and Monitoring
- Comprehensive console logging for debugging
- Performance metrics and cache statistics
- Error tracking and reporting

## Testing Strategy

### Unit Testing
- Each manager component is independently testable
- Mock dependencies for isolated testing
- Comprehensive test coverage for core functionality

### Integration Testing
- End-to-end testing of manager interactions
- Cache behavior validation
- Performance regression testing

### Browser Compatibility
- Cross-browser testing for storage APIs
- Web Worker compatibility validation
- Progressive enhancement for unsupported features

## Migration Guide

### From Legacy Repo Class
The refactored architecture maintains backward compatibility while providing new capabilities:

```typescript
// Legacy usage still works
const repo = new Repo(config);
await repo.getFileContent({ path: 'README.md' });

// New manager access for advanced usage
repo.fileManager.clearCache();
repo.commitManager.setPageSize(100);
```

### Breaking Changes
- `resetRepo()` method removed (use manager-specific reset methods)
- File operations now return structured objects instead of raw data
- Some internal properties are no longer directly accessible

## Future Enhancements

### Planned Manager Components
- **IssueManager**: Issue tracking and management
- **RepositoryCore**: Basic repository metadata and configuration
- **SearchManager**: Full-text search across repository content
- **NotificationManager**: Real-time updates and notifications

### Performance Improvements
- Service Worker integration for offline support
- Streaming data processing for large repositories
- Advanced caching strategies with predictive loading

### Developer Experience
- TypeScript strict mode compliance
- Enhanced debugging tools and dev mode features
- Comprehensive API documentation and examples

## Conclusion

The composition-based architecture provides a solid foundation for building scalable, maintainable git repository interfaces. The manager system enables focused development, comprehensive testing, and flexible deployment while maintaining excellent performance through intelligent caching and progressive loading strategies.
