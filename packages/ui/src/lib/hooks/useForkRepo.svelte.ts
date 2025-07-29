import type { Event } from 'nostr-tools';
import { createClonedRepoStateEvent } from '@nostr-git/shared-types';

// Types for fork configuration and progress
interface OriginalRepo {
  owner: string;
  name: string;
  description?: string;
}

interface ForkConfig {
  forkName: string;
  visibility: 'public' | 'private';
}

interface ForkProgress {
  stage: string;
  percentage: number;
  isComplete: boolean;
}

interface ForkResult {
  success: boolean;
  repoId: string;
  forkUrl: string;
  defaultBranch: string;
  branches: string[];
  tags: string[];
  error?: string;
}

/**
 * Svelte 5 composable for managing fork repository workflow
 * Handles git-worker integration, progress tracking, and NIP-34 event emission
 */
export function useForkRepo() {
  // Reactive state using Svelte 5 runes
  let progress = $state<ForkProgress | undefined>();
  let error = $state<string | undefined>();
  let isForking = $state(false);

  /**
   * Fork a repository with full workflow
   * 1. Create remote fork via GitHub API
   * 2. Poll until fork is ready
   * 3. Clone fork locally
   * 4. Emit NIP-34 repository state event
   * 5. Register in global store
   */
  async function forkRepository(
    originalRepo: OriginalRepo,
    config: ForkConfig,
    options: {
      token: string;
      currentUser: string;
      onSignEvent: (event: Partial<Event>) => Promise<Event>;
      onPublishEvent: (event: Event) => Promise<void>;
      onRegisterRepo?: (repoId: string, forkUrl: string) => Promise<void>;
    }
  ): Promise<void> {
    const { token, currentUser, onSignEvent, onPublishEvent, onRegisterRepo } = options;
    
    // Reset state
    error = undefined;
    isForking = true;
    progress = {
      stage: 'Initializing fork operation...',
      percentage: 0,
      isComplete: false
    };

    try {
      // Get the git worker instance using dynamic import
      const { getGitWorker } = await import('$lib/git-worker');
      const gitWorker = await getGitWorker();

      // Generate destination directory for the fork
      const destinationPath = `${currentUser}/${config.forkName}`;

      // Progress callback to update UI
      const onProgress = (stage: string, pct?: number) => {
        progress = {
          stage,
          percentage: pct || 0,
          isComplete: false
        };
      };

      // Call git-worker to fork and clone
      const result: ForkResult = await gitWorker.forkAndCloneRepo({
        owner: originalRepo.owner,
        repo: originalRepo.name,
        forkName: config.forkName,
        visibility: config.visibility,
        token,
        dir: destinationPath,
        onProgress
      });

      if (!result.success) {
        throw new Error(result.error || 'Fork operation failed');
      }

      // Update progress for NIP-34 event creation
      progress = {
        stage: 'Creating repository announcement...',
        percentage: 95,
        isComplete: false
      };

      // Create NIP-34 repository state event for the fork
      const forkEvent = createClonedRepoStateEvent(
        result.repoId,
        result.forkUrl,
        result.branches,
        result.tags,
        [currentUser] // Current user as maintainer
      );

      // Sign and publish the event via injected closures
      const signedEvent = await onSignEvent(forkEvent);
      await onPublishEvent(signedEvent);

      // Register the fork in the global repository store
      if (onRegisterRepo) {
        await onRegisterRepo(result.repoId, result.forkUrl);
      }

      // Mark as complete
      progress = {
        stage: 'Fork completed successfully!',
        percentage: 100,
        isComplete: true
      };

    } catch (err: any) {
      console.error('Fork repository failed:', err);
      error = err.message || 'Fork operation failed';
      
      // Reset progress on error
      progress = undefined;
    } finally {
      isForking = false;
    }
  }

  /**
   * Reset the fork state
   * Useful for retrying after errors or starting fresh
   */
  function reset(): void {
    progress = undefined;
    error = undefined;
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
