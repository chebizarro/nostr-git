// Main exports for the git-worker package
export { getGitWorker, configureWorkerEventIO } from './client.js';
export type { CloneProgressEvent } from './client.js';

// Export worker utilities
export * from './lib/workers/auth.js';
export * from './lib/workers/cache.js';
export * from './lib/workers/fs-utils.js';
export * from './lib/workers/patches.js';
export * from './lib/workers/push.js';
export * from './lib/workers/repos.js';
export * from './lib/workers/sync.js';

// Export utility functions
export * from './utils/canonicalRepoKey.js';
export * from './git.js';
export * from './merge-analysis.js';
export * from './files.js';
export * from './git/factory.js';
export * from './vendor-providers.js';

// Export branches separately to avoid conflicts
export { resolveRobustBranch } from './lib/workers/branches.js';
