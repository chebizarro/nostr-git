// Entry point for @nostr-git/core
// Export all main public APIs from core/src/lib

// Worker functionality from git-worker package
// NOTE: This must be lazy-imported because the git-worker client uses bundler-only
// module specifiers (e.g. '?worker&url') that crash in pure Node runtimes.
export type { CloneProgressEvent } from '@nostr-git/git-worker';

export async function getGitWorker(
  onProgress?: (event: MessageEvent | import('@nostr-git/git-worker').CloneProgressEvent) => void
) {
  const mod = await import('@nostr-git/git-worker');
  return mod.getGitWorker(onProgress);
}

export async function configureWorkerEventIO(api: any, io: import('@nostr-git/shared-types').EventIO): Promise<void> {
  const mod = await import('@nostr-git/git-worker');
  return mod.configureWorkerEventIO(api, io);
}

export * from './lib/git.js';
export * from './lib/permalink.js';
export * from './lib/event.js';
export * from './lib/fork-handler.js';
export * from './lib/git-provider.js';

// Event publishing interfaces
export { 
  createEventPublisher, 
  createBatchEventPublisher, 
  createRetryEventPublisher,
  type EventPublisher 
} from './lib/event-publisher.js';

export { 
  createEventIO, 
  createLegacyEventIOAdapter,
  type EventIO,
  type LegacyEventIO 
} from './lib/eventio.js';
export * from './lib/files.js';
export * from './lib/repo.js';
export * from './lib/branches.js';
export * from './lib/patches.js';
export * from './lib/merge-analysis.js';
export * from './lib/merge.js';
export * from './utils/binaryUtils.js';
export * from './lib/validation.js';
// NIP-34 alignment scaffolding exports
export * from './lib/repositories.js';
export * from './lib/repoState.js';
export * from './lib/patchGraph.js';
export * from './lib/issues.js';
export * from './lib/labels.js';
export * from './lib/subscriptions.js';
export * from './lib/status-resolver.js';
export * from './lib/stack.js';
export * from './lib/stack-graph.js';
// Export from repoKeys, but exclude canonicalRepoKey to avoid conflict with utils/canonicalRepoKey
export { 
  buildCanonicalRepoKey,
  warnIfLegacyRepoKey,
  normalizeRepoKeyFlexible,
  type RepoKeyPreference,
  type RepoKeyResolvers,
  type ParsedRepoKey
} from './lib/repoKeys.js';
export { buildPatchDAG } from './lib/repoDAG.js';
export * from './lib/status163x.js';
export type { LabelNS } from './lib/labels32.js';
export { mergeEffectiveLabels as mergeEffectiveLabels32 } from './lib/labels32.js';
export * from './lib/grasp.js';
export * from './utils/groupByRepoIdentity.js';

// Git Interface Hardening - New modules
export * from './keys/index.js';
export * from './errors/index.js';
export * from './retry/index.js';
export * from './retry/timeout.js';
export * from './trace/index.js';

// Re-export Comlink proxy for worker communication
export { proxy } from 'comlink';
