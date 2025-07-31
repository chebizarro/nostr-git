import { createRepoAnnouncementEvent, createRepoStateEvent, RepoAnnouncementEvent, RepoStateEvent } from '@nostr-git/shared-types';
import { tokens as tokensStore } from '../stores/tokens.js';

// Types for fork configuration and progress
export interface ForkConfig {
  forkName: string;
  visibility?: 'public' | 'private'; // Optional since NIP-34 doesn't support private/public repos yet
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
      // Step 1: Validate GitHub token
      updateProgress('validate', 'Validating GitHub token...', 'running');
      const githubToken = tokens.find(t => t.host === 'github.com')?.token;
      if (!githubToken) {
        throw new Error('GitHub token not found. Please add a GitHub token in settings.');
      }
      updateProgress('validate', 'GitHub token validated', 'completed');

      // Step 2: Get current user
      updateProgress('user', 'Getting current user info...', 'running');
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (!userResponse.ok) {
        throw new Error('Failed to get GitHub user info');
      }
      
      const userData = await userResponse.json();
      const currentUser = userData.login;
      updateProgress('user', `Current user: ${currentUser}`, 'completed');

      // Step 3: Fork and clone repository using git-worker
      updateProgress('fork', 'Creating fork and cloning repository...', 'running');
      const { getGitWorker } = await import('@nostr-git/core');
      const { api } = getGitWorker();

      // Use just the fork name as directory path (browser virtual file system)
      const destinationPath = config.forkName;

      const workerResult = await api.forkAndCloneRepo({
        owner: originalRepo.owner,
        repo: originalRepo.name,
        forkName: config.forkName,
        visibility: config.visibility,
        token: githubToken,
        dir: destinationPath
        // Note: onProgress callback removed - functions cannot be serialized through Comlink
      });

      if (!workerResult.success) {
        console.error('🔍 Fork worker result:', workerResult);
        throw new Error(workerResult.error || 'Fork operation failed');
      }
      updateProgress('fork', 'Repository forked and cloned successfully', 'completed');

      // Step 4: Create NIP-34 events
      updateProgress('events', 'Creating Nostr events...', 'running');
      
      // Create Repository Announcement event (kind 30617)
      const announcementEvent = createRepoAnnouncementEvent({
        repoId: workerResult.repoId,
        name: config.forkName,
        description: originalRepo.description || `Fork of ${originalRepo.owner}/${originalRepo.name}`,
        clone: [workerResult.forkUrl],
        web: [workerResult.forkUrl.replace(/\.git$/, '')],
        maintainers: [currentUser]
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
