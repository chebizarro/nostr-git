// Entry point for @nostr-git/core
// Export all main public APIs from core/src/lib

export * from './lib/git.js';
export * from './lib/permalink.js';
export * from './lib/event.js';
export * from './lib/fork-handler.js';
export * from './lib/git-provider.js';
export * from './lib/git-worker-client.js';
export * from './lib/files.js';
export * from './lib/repo.js';
export * from './lib/workers/git-worker.js';
export * from './lib/branches.js';
export * from './lib/patches.js';
export * from './lib/merge-analysis.js';
export * from './lib/merge.js';
export * from './lib/git/index.js';
export * from './lib/utils/canonicalRepoKey.js';
export * from './lib/grasp-lists.js';
export * from './lib/utils/binaryUtils.js';
export * from './lib/validation.js';
// NIP-34 alignment scaffolding exports
export * from './lib/repositories.js';
export * from './lib/repoState.js';
export * from './lib/patchGraph.js';
export * from './lib/issues.js';
export * from './lib/labels.js';
export * from './lib/subscriptions.js';
export * from './lib/status-resolver.js';
export * from './lib/repoKeys.js';
