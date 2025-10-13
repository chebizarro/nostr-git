// Entry point for @nostr-git/core
// Export all main public APIs from core/src/lib

export * from './lib/git.js';
export * from './lib/permalink.js';
export * from './lib/event.js';
export * from './lib/fork-handler.js';
export * from './lib/git-provider.js';
export * from './lib/git-worker-client.js';

// Clean event publishing interfaces
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
export * from './lib/workers/git-worker.js';
export * from './lib/branches.js';
export * from './lib/patches.js';
export * from './lib/merge-analysis.js';
export * from './lib/merge.js';
export * from './lib/git/index.js';
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
export { buildPatchDAG } from './lib/repoDAG.js';
export * from './lib/status163x.js';
export type { LabelNS } from './lib/labels32.js';
export { mergeEffectiveLabels as mergeEffectiveLabels32 } from './lib/labels32.js';
export * from './lib/grasp.js';
export * from './lib/utils/groupByRepoIdentity.js';

// Git Interface Hardening - New modules
export * from './keys/index.js';
export * from './errors/index.js';
export * from './retry/index.js';
export * from './retry/timeout.js';
export * from './trace/index.js';

// Re-export Comlink proxy for worker communication
export { proxy } from 'comlink';

// NostrGitProvider and GRASP Integration exports
export {
  NostrGitProvider,
  type NostrGitConfig,
  type RepoDiscovery,
  type NostrPushResult
} from './lib/git/providers/nostr-git-provider.js';
export {
  GraspApi,
  type GraspApiConfig
} from './lib/git/providers/grasp-api.js';
export {
  createNostrGitProvider,
  createNostrGitProviderFromEnv,
  createNostrGitProviderFromGitConfig,
  selectProvider,
  createProviderForUrl,
  DEFAULT_RELAYS
} from './lib/git/providers/nostr-git-factory.js';
