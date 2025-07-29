import { type Event as NostrEvent } from 'nostr-tools';

export interface NewRepoConfig {
  name: string;
  description: string;
  initializeWithReadme: boolean;
  gitignoreTemplate: string;
  licenseTemplate: string;
  defaultBranch: string;
  // Author information
  authorName: string;
  authorEmail: string;
  // NIP-34 metadata
  maintainers?: string[]; // Additional maintainer pubkeys
  relays?: string[]; // Preferred relays for this repo
  tags?: string[]; // Repository tags/topics
  webUrl?: string; // Web browsing URL
  cloneUrl?: string; // Git clone URL
}

export interface NewRepoResult {
  localRepo: {
    repoId: string;
    path: string;
    branch: string;
    initialCommit: string;
  };
  remoteRepo?: {
    url: string;
    provider: string;
    webUrl: string;
  };
  announcementEvent: Omit<NostrEvent, 'id' | 'sig' | 'pubkey' | 'created_at'>;
  stateEvent: Omit<NostrEvent, 'id' | 'sig' | 'pubkey' | 'created_at'>;
}

export interface NewRepoProgress {
  step: string;
  message: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
}

export interface UseNewRepoOptions {
  onProgress?: (progress: NewRepoProgress[]) => void;
  onRepoCreated?: (result: NewRepoResult) => void;
  onPublishEvent?: (event: Omit<NostrEvent, 'id' | 'sig' | 'pubkey' | 'created_at'>) => Promise<void>;
}

/**
 * Svelte hook for creating new repositories with NIP-34 integration
 * 
 * @example
 * ```typescript
 * const { createRepository, isCreating, progress, error } = useNewRepo({
 *   onProgress: (steps) => console.log('Progress:', steps),
 *   onRepoCreated: (result) => console.log('Created:', result),
 *   onPublishEvent: async (event) => await publishToRelay(event)
 * });
 * 
 * // Create a new repository
 * await createRepository({
 *   name: 'my-project',
 *   description: 'A cool project',
 *   initializeWithReadme: true,
 *   gitignoreTemplate: 'node',
 *   licenseTemplate: 'mit',
 *   defaultBranch: 'main'
 * });
 * ```
 */
export function useNewRepo(options: UseNewRepoOptions = {}) {
  let isCreating = $state(false);
  let progress = $state<NewRepoProgress[]>([]);
  let error = $state<string | null>(null);

  const { onProgress, onRepoCreated, onPublishEvent } = options;

  function updateProgress(step: string, message: string, status: NewRepoProgress['status'], errorMsg?: string) {
    const stepIndex = progress.findIndex(p => p.step === step);
    const newStep: NewRepoProgress = { step, message, status, error: errorMsg };
    
    if (stepIndex >= 0) {
      progress[stepIndex] = newStep;
    } else {
      progress = [...progress, newStep];
    }
    
    onProgress?.(progress);
  }

  async function createRepository(config: NewRepoConfig): Promise<NewRepoResult | null> {
    if (isCreating) {
      throw new Error('Repository creation already in progress');
    }

    try {
      isCreating = true;
      error = null;
      progress = [];

      // Step 1: Create local repository
      updateProgress('local', 'Creating local repository...', 'running');
      const localRepo = await createLocalRepo(config);
      updateProgress('local', 'Local repository created successfully', 'completed');

      // Step 2: Create remote repository (optional)
      updateProgress('remote', 'Creating remote repository...', 'running');
      const remoteRepo = await createRemoteRepo(config);
      if (remoteRepo) {
        updateProgress('remote', 'Remote repository created successfully', 'completed');
      } else {
        updateProgress('remote', 'Skipped remote repository creation', 'completed');
      }

      // Step 3: Push to remote (if remote exists)
      if (remoteRepo) {
        updateProgress('push', 'Pushing to remote repository...', 'running');
        await pushToRemote(config, remoteRepo);
        updateProgress('push', 'Successfully pushed to remote repository', 'completed');
      }

      // Step 4: Create NIP-34 events
      updateProgress('events', 'Creating Nostr events...', 'running');
      const announcementEvent = createRepoAnnouncementEvent(config, localRepo, remoteRepo);
      const stateEvent = createRepoStateEvent(config, localRepo, remoteRepo);
      updateProgress('events', 'Nostr events created successfully', 'completed');

      // Step 5: Publish events (if handler provided)
      if (onPublishEvent) {
        updateProgress('publish', 'Publishing to Nostr relays...', 'running');
        await onPublishEvent(announcementEvent);
        await onPublishEvent(stateEvent);
        updateProgress('publish', 'Successfully published to Nostr relays', 'completed');
      }

      const result: NewRepoResult = {
        localRepo,
        remoteRepo,
        announcementEvent,
        stateEvent
      };

      onRepoCreated?.(result);
      return result;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      error = errorMessage;
      
      // Update the current step to error status
      const currentStep = progress.find(p => p.status === 'running');
      if (currentStep) {
        updateProgress(currentStep.step, `Failed: ${errorMessage}`, 'error', errorMessage);
      }
      
      console.error('Repository creation failed:', err);
      return null;
    } finally {
      isCreating = false;
    }
  }

  async function createLocalRepo(config: NewRepoConfig) {
    const { getGitWorker } = await import('@nostr-git/core');
    const { api } = getGitWorker();
    
    const result = await api.createLocalRepo({
      repoId: config.name,
      name: config.name,
      description: config.description,
      defaultBranch: config.defaultBranch,
      initializeWithReadme: config.initializeWithReadme,
      gitignoreTemplate: config.gitignoreTemplate,
      licenseTemplate: config.licenseTemplate,
      authorName: config.authorName,
      authorEmail: config.authorEmail
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create local repository');
    }
    
    return {
      repoId: config.name,
      path: result.repoPath,
      branch: config.defaultBranch,
      initialCommit: result.initialCommit
    };
  }

  async function createRemoteRepo(config: NewRepoConfig) {
    try {
      const { getGitWorker } = await import('@nostr-git/core');
      const { api } = getGitWorker();
      
      const result = await api.createRemoteRepo({
        repoName: config.name,
        description: config.description,
        provider: 'github' // Default to GitHub for now
      });
      
      if (!result.success) {
        console.warn('Remote repository creation failed:', result.error);
        return null; // Continue without remote
      }
      
      return {
        url: result.cloneUrl,
        provider: result.provider,
        webUrl: result.webUrl
      };
    } catch (error) {
      console.warn('Remote repository creation failed:', error);
      return null; // Continue without remote
    }
  }

  async function pushToRemote(config: NewRepoConfig, remoteRepo: any) {
    const { getGitWorker } = await import('@nostr-git/core');
    const { api } = getGitWorker();
    
    const result = await api.pushToRemote({
      repoName: config.name,
      remoteUrl: remoteRepo.url,
      branch: config.defaultBranch
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to push to remote repository');
    }
    
    return result;
  }

  function createRepoAnnouncementEvent(
    config: NewRepoConfig, 
    localRepo: any, 
    remoteRepo?: any
  ): Omit<NostrEvent, 'id' | 'sig' | 'pubkey' | 'created_at'> {
    const cloneUrls = [];
    const webUrls = [];
    
    // Add remote URLs if available
    if (remoteRepo?.url) cloneUrls.push(remoteRepo.url);
    if (remoteRepo?.webUrl) webUrls.push(remoteRepo.webUrl);
    
    // Add user-provided URLs
    if (config.cloneUrl) cloneUrls.push(config.cloneUrl);
    if (config.webUrl) webUrls.push(config.webUrl);
    
    const tags = [
      ['d', localRepo.repoId],
      ['name', config.name],
      ['description', config.description],
      ['r', localRepo.initialCommit, 'euc']
    ];
    
    // Add clone URLs
    if (cloneUrls.length > 0) {
      tags.push(['clone', ...cloneUrls]);
    }
    
    // Add web URLs
    if (webUrls.length > 0) {
      tags.push(['web', ...webUrls]);
    }
    
    // Add maintainers (additional to the author)
    if (config.maintainers && config.maintainers.length > 0) {
      config.maintainers.forEach(maintainer => {
        tags.push(['maintainer', maintainer]);
      });
    }
    
    // Add relays
    if (config.relays && config.relays.length > 0) {
      config.relays.forEach(relay => {
        tags.push(['relay', relay]);
      });
    }
    
    // Add tags/topics
    if (config.tags && config.tags.length > 0) {
      config.tags.forEach(tag => {
        tags.push(['t', tag]);
      });
    }
    
    return {
      kind: 30617,
      content: config.description || '',
      tags
    };
  }

  function createRepoStateEvent(
    config: NewRepoConfig, 
    localRepo: any, 
    remoteRepo?: any
  ): Omit<NostrEvent, 'id' | 'sig' | 'pubkey' | 'created_at'> {
    return {
      kind: 30618,
      content: '',
      tags: [
        ['d', localRepo.repoId],
        ['HEAD', `refs/heads/${config.defaultBranch}`, localRepo.initialCommit],
        ['refs/heads/' + config.defaultBranch, localRepo.initialCommit]
      ]
    };
  }

  function reset() {
    isCreating = false;
    progress = [];
    error = null;
  }

  function retry() {
    // Reset error state and allow retry
    error = null;
    progress = progress.map(p => 
      p.status === 'error' ? { ...p, status: 'pending' as const } : p
    );
  }

  return {
    // State
    isCreating: () => isCreating,
    progress: () => progress,
    error: () => error,
    
    // Actions
    createRepository,
    reset,
    retry
  };
}
