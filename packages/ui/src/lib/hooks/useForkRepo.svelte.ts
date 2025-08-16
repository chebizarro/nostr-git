import { createRepoAnnouncementEvent, createRepoStateEvent, RepoAnnouncementEvent, RepoStateEvent } from '@nostr-git/shared-types';
import { tokens as tokensStore } from '../stores/tokens.js';
import { getGitServiceApi } from '@nostr-git/core';

// Types for fork configuration and progress
export interface ForkConfig {
  forkName: string;
  visibility?: 'public' | 'private'; // Optional since NIP-34 doesn't support private/public repos yet
  provider?: 'github' | 'gitlab' | 'gitea' | 'bitbucket' | 'grasp';
  relayUrl?: string; // Required for GRASP
}

export interface ForkProgress {
  step: string;
  message: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
}

export interface ForkResult {
  repoId: string;
  forkUrl: string;
  defaultBranch: string;
  branches: string[];
  tags: string[];
  announcementEvent: RepoAnnouncementEvent;
  stateEvent: RepoStateEvent;
}

export interface UseForkRepoOptions {
  onProgress?: (progress: ForkProgress[]) => void;
  onForkCompleted?: (result: ForkResult) => void;
  onPublishEvent?: (event: RepoAnnouncementEvent | RepoStateEvent) => Promise<void>;
}

/**
 * Svelte 5 composable for managing fork repository workflow
 * Handles git-worker integration, progress tracking, and NIP-34 event emission
 *
 * @example
 * ```typescript
 * const { forkRepository, isForking, progress, error } = useForkRepo({
 *   onProgress: (steps) => console.log('Progress:', steps),
 *   onForkCompleted: (result) => console.log('Forked:', result),
 *   onPublishEvent: async (event) => await publishToRelay(event)
 * });
 *
 * // Fork a repository
 * await forkRepository({
 *   owner: 'original-owner',
 *   name: 'repo-name',
 *   description: 'Original repo description'
 * }, {
 *   forkName: 'my-fork',
 *   visibility: 'public'
 * });
 * ```
 */
export function useForkRepo(options: UseForkRepoOptions = {}) {
  let isForking = $state(false);
  let progress = $state<ForkProgress[]>([]);
  let error = $state<string | null>(null);

  let tokens = $state([]);

  // Subscribe to token store changes and update reactive state
  tokensStore.subscribe((t) => {
    tokens = t;
    console.log('🔐 Token store updated, now have', t.length, 'tokens');
  });

  const { onProgress, onForkCompleted, onPublishEvent } = options;

  function updateProgress(
    step: string,
    message: string,
    status: 'pending' | 'running' | 'completed' | 'error',
    errorMessage?: string
  ) {
    const existingIndex = progress.findIndex(p => p.step === step);
    const progressItem: ForkProgress = { step, message, status, error: errorMessage };
    
    if (existingIndex >= 0) {
      progress[existingIndex] = progressItem;
    } else {
      progress.push(progressItem);
    }
    
    onProgress?.(progress);
  }

  /**
   * Fork a repository with full workflow
   * 1. Create remote fork via GitHub API
   * 2. Poll until fork is ready
   * 3. Clone fork locally
   * 4. Create and emit NIP-34 events
   */
  async function forkRepository(
    originalRepo: { owner: string; name: string; description?: string },
    config: ForkConfig
  ): Promise<ForkResult | null> {
    if (isForking) {
      throw new Error('Fork operation already in progress');
    }

    isForking = true;
    error = null;
    progress = [];

    try {
      // Validate inputs early
      if (!originalRepo?.owner || !originalRepo?.name) {
        throw new Error(`Invalid original repo: owner="${originalRepo?.owner}", name="${originalRepo?.name}"`);
      }
      if (!config?.forkName || !config.forkName.trim()) {
        throw new Error('Fork name is required');
      }

      // Step 1: Determine provider and validate token (skip token for GRASP)
      const provider = config.provider || 'github'; // Default to GitHub for backward compatibility
      const providerHost = provider === 'github' ? 'github.com' : 
                          provider === 'gitlab' ? 'gitlab.com' :
                          provider === 'gitea' ? 'gitea.com' :
                          provider === 'bitbucket' ? 'bitbucket.org' : 'github.com';
      
      let providerToken: string | undefined;
      let pubkey: string | undefined;
      let relayUrl: string | undefined;

      if (provider === 'grasp') {
        updateProgress('validate', 'Validating Nostr signer and relay URL...', 'running');
        // Get signer from global store (same as new repo flow)
        const { signer: signerStore } = await import('../stores/signer');
        let nostrSigner: any = null;
        signerStore.subscribe((v: any) => (nostrSigner = v))();
        if (!nostrSigner) {
          throw new Error('No Nostr signer available for GRASP');
        }
        if (!config.relayUrl) {
          throw new Error('GRASP requires a relay URL');
        }
        relayUrl = config.relayUrl;
        pubkey = await nostrSigner.getPubkey();
        providerToken = pubkey; // Use pubkey as token identifier
        updateProgress('validate', 'Nostr signer and relay URL validated', 'completed');
      } else {
        updateProgress('validate', `Validating ${provider} token...`, 'running');
        providerToken = tokens.find(t => t.host === providerHost)?.token;
        if (!providerToken) {
          throw new Error(`${provider} token not found. Please add a ${provider} token in settings.`);
        }
        updateProgress('validate', `${provider} token validated`, 'completed');
      }

      // Step 2: Get current user using GitServiceApi
      updateProgress('user', 'Getting current user info...', 'running');
      const gitServiceApi = getGitServiceApi(provider as any, providerToken!, relayUrl);
      const userData = await gitServiceApi.getCurrentUser();
      const currentUser = userData.login;
      updateProgress('user', `Current user: ${currentUser}`, 'completed');

      // Step 3: Fork and clone repository using git-worker
      updateProgress('fork', 'Creating fork and cloning repository...', 'running');
      const { getGitWorker } = await import('@nostr-git/core');
      const { api: gitWorkerApi, worker } = getGitWorker();

      // Use just the fork name as directory path (browser virtual file system)
      const destinationPath = config.forkName;

      // If GRASP, set up message-based signing so worker can request signatures
      if (provider === 'grasp') {
        // Register message handler for signing requests
        worker.addEventListener('message', async (event: MessageEvent) => {
          if ((event as any).data?.type === 'request-event-signing') {
            try {
              const { signer: signerStore } = await import('../stores/signer');
              let nostrSigner: any = null;
              signerStore.subscribe((v: any) => (nostrSigner = v))();
              const signedEvent = await nostrSigner.sign((event as any).data.event);
              worker.postMessage({
                type: 'event-signed',
                requestId: (event as any).data.requestId,
                signedEvent
              });
            } catch (e: any) {
              worker.postMessage({
                type: 'event-signing-error',
                requestId: (event as any).data.requestId,
                error: e?.message || String(e)
              });
            }
          }
        });
        worker.postMessage({ type: 'register-event-signer' });
      }

      const workerResult = await gitWorkerApi.forkAndCloneRepo({
        owner: originalRepo.owner,
        repo: originalRepo.name,
        forkName: config.forkName,
        visibility: config.visibility,
        token: providerToken!,
        provider: provider,
        baseUrl: relayUrl,
        dir: destinationPath
        // Note: onProgress callback removed - functions cannot be serialized through Comlink
      });
      console.log('[useForkRepo] forkAndCloneRepo returned', workerResult);

      if (!workerResult.success) {
        const ctx = `owner=${originalRepo.owner} repo=${originalRepo.name} forkName=${config.forkName} provider=${provider}`;
        throw new Error(`${workerResult.error || 'Fork operation failed'} (${ctx})`);
      }
      updateProgress('fork', 'Repository forked and cloned successfully', 'completed');

      // Step 4: Create NIP-34 events
      updateProgress('events', 'Creating Nostr events...', 'running');
      
      // Create Repository Announcement event (kind 30617)
      // For GRASP, ensure the relay URL is included in both relays and clone tags
      const cloneUrls = [workerResult.forkUrl];
      if (provider === 'grasp' && relayUrl && !cloneUrls.includes(relayUrl)) {
        cloneUrls.push(relayUrl);
      }

      const relays = provider === 'grasp' && relayUrl ? [relayUrl] : undefined;

      const announcementEvent = createRepoAnnouncementEvent({
        repoId: workerResult.repoId,
        name: config.forkName,
        description: originalRepo.description || `Fork of ${originalRepo.owner}/${originalRepo.name}`,
        clone: cloneUrls,
        web: [workerResult.forkUrl.replace(/\.git$/, '')],
        maintainers: [currentUser],
        ...(relays ? { relays } : {})
      });
      
      // Create Repository State event (kind 30618)
      const stateEvent = createRepoStateEvent({
        repoId: workerResult.repoId,
        refs: [
          ...workerResult.branches.map(branch => ({
            type: 'heads' as const,
            name: branch,
            commit: '' // Will be filled by actual implementation
          })),
          ...workerResult.tags.map(tag => ({
            type: 'tags' as const,
            name: tag,
            commit: '' // Will be filled by actual implementation
          }))
        ],
        head: workerResult.defaultBranch
      });
      
      updateProgress('events', 'Nostr events created successfully', 'completed');

      // Step 5: Publish events (if handler provided)
      if (onPublishEvent) {
        updateProgress('publish', 'Publishing to Nostr relays...', 'running');
        await onPublishEvent(announcementEvent);
        await onPublishEvent(stateEvent);
        updateProgress('publish', 'Successfully published to Nostr relays', 'completed');
      }

      const result: ForkResult = {
        repoId: workerResult.repoId,
        forkUrl: workerResult.forkUrl,
        defaultBranch: workerResult.defaultBranch,
        branches: workerResult.branches,
        tags: workerResult.tags,
        announcementEvent,
        stateEvent
      };

      onForkCompleted?.(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      error = errorMessage;

      // Update the current step to error status
      const currentStep = progress.find((p) => p.status === 'running');
      if (currentStep) {
        updateProgress(currentStep.step, `Failed: ${errorMessage}`, 'error', errorMessage);
      }

      console.error('Repository fork failed:', err);
      return null;
    } finally {
      isForking = false;
    }
  }

  /**
   * Reset the fork state
   * Useful for retrying after errors or starting fresh
   */
  function reset(): void {
    progress = [];
    error = null;
    isForking = false;
  }

  // Return reactive state and methods
  return {
    // Reactive state (automatically reactive in Svelte 5)
    get progress() { return progress; },
    get error() { return error; },
    get isForking() { return isForking; },

    // Methods
    forkRepository,
    reset
  };
}
