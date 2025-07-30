import type { Event } from 'nostr-tools';
import type { RepoAnnouncementEvent, RepoStateEvent } from '@nostr-git/shared-types';
import { makeRepoAnnouncementEvent, makeRepoStateEvent } from '@nostr-git/shared-types';

// Types for edit configuration and progress
interface EditConfig {
  name: string;
  description: string;
  visibility: 'public' | 'private';
  defaultBranch: string;
  readmeContent: string;
}

interface EditProgress {
  stage: string;
  percentage: number;
  isComplete: boolean;
}

interface EditResult {
  success: boolean;
  updatedRepo?: any;
  commitId?: string;
  error?: string;
}

/**
 * Svelte 5 composable for managing edit repository workflow
 * Handles git-worker integration, progress tracking, and NIP-34 event emission
 */
export function useEditRepo() {
  // Reactive state using Svelte 5 runes
  let progress = $state<EditProgress | undefined>();
  let error = $state<string | undefined>();
  let isEditing = $state(false);

  /**
   * Edit a repository with full workflow
   * 1. Update remote repository metadata via GitHub API
   * 2. Update and push files (README, etc.) to repository
   * 3. Create and emit updated NIP-34 events
   * 4. Update local store
   */
  async function editRepository(
    currentAnnouncement: RepoAnnouncementEvent,
    currentState: RepoStateEvent,
    config: EditConfig,
    options: {
      token: string;
      currentUser: string;
      repoDir: string;
      onSignEvent: (event: Partial<Event>) => Promise<Event>;
      onPublishEvent: (event: Event) => Promise<void>;
      onUpdateStore?: (repoId: string, updates: any) => Promise<void>;
    }
  ): Promise<void> {
    const { token, currentUser, repoDir, onSignEvent, onPublishEvent, onUpdateStore } = options;
    
    // Reset state
    error = undefined;
    isEditing = true;
    progress = {
      stage: 'Initializing repository update...',
      percentage: 0,
      isComplete: false
    };

    try {
      // Get the git worker instance using dynamic import
      const { getGitWorker } = await import('@nostr-git/core');
      const gitWorker = await getGitWorker();

      // Extract current repository info
      const repoId = currentAnnouncement.tags.find(t => t[0] === 'd')?.[1] || '';
      const currentName = currentAnnouncement.tags.find(t => t[0] === 'name')?.[1] || '';
      const cloneUrl = currentAnnouncement.tags.find(t => t[0] === 'clone')?.[1] || '';
      
      // Parse owner/repo from clone URL
      const urlMatch = cloneUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
      if (!urlMatch) {
        throw new Error('Unable to parse repository owner/name from clone URL');
      }
      const [, owner, repo] = urlMatch;

      // Progress callback to update UI
      const onProgress = (stage: string, pct?: number) => {
        progress = {
          stage,
          percentage: pct || 0,
          isComplete: false
        };
      };

      // Step 1: Update remote repository metadata if needed
      const metadataChanged = (
        config.name !== currentName ||
        config.description !== (currentAnnouncement.tags.find(t => t[0] === 'description')?.[1] || '') ||
        config.visibility !== (cloneUrl.includes('private') ? 'private' : 'public')
      );

      if (metadataChanged) {
        progress = {
          stage: 'Updating remote repository metadata...',
          percentage: 10,
          isComplete: false
        };

        const metadataResult: EditResult = await gitWorker.updateRemoteRepoMetadata({
          owner,
          repo,
          updates: {
            name: config.name !== currentName ? config.name : undefined,
            description: config.description,
            private: config.visibility === 'private'
          },
          token
        });

        if (!metadataResult.success) {
          throw new Error(metadataResult.error || 'Failed to update repository metadata');
        }
      }

      // Step 2: Update files if needed (README, default branch changes)
      const filesChanged = (
        config.readmeContent !== `# ${currentName}\n\n${currentAnnouncement.tags.find(t => t[0] === 'description')?.[1] || ''}` ||
        config.defaultBranch !== (currentState.tags.find(t => t[0] === 'HEAD')?.[1]?.replace('ref: refs/heads/', '') || 'main')
      );

      if (filesChanged) {
        progress = {
          stage: 'Updating repository files...',
          percentage: 40,
          isComplete: false
        };

        const filesToUpdate = [];
        
        // Add README if changed
        if (config.readmeContent) {
          filesToUpdate.push({
            path: 'README.md',
            content: config.readmeContent
          });
        }

        if (filesToUpdate.length > 0) {
          const filesResult: EditResult = await gitWorker.updateAndPushFiles({
            dir: repoDir,
            files: filesToUpdate,
            commitMessage: `Update repository files via Nostr Git\n\n- Updated README.md\n- Updated repository metadata`,
            token,
            onProgress
          });

          if (!filesResult.success) {
            throw new Error(filesResult.error || 'Failed to update repository files');
          }
        }
      }

      // Step 3: Create and emit updated NIP-34 events
      progress = {
        stage: 'Creating repository announcement events...',
        percentage: 70,
        isComplete: false
      };

      // Create updated repository announcement event
      const updatedCloneUrl = metadataChanged && config.name !== currentName 
        ? cloneUrl.replace(`/${repo}.git`, `/${config.name}.git`)
        : cloneUrl;

      const announcementEvent = makeRepoAnnouncementEvent({
        repoSlug: `${owner}/${config.name}`,
        name: config.name,
        description: config.description,
        visibility: config.visibility,
        cloneUrl: updatedCloneUrl,
        timestamp: Math.floor(Date.now() / 1000)
      });

      // Create updated repository state event
      const stateEvent = makeRepoStateEvent({
        repoSlug: `${owner}/${config.name}`,
        remoteUrl: updatedCloneUrl,
        head: `ref: refs/heads/${config.defaultBranch}`,
        defaultBranch: config.defaultBranch,
        timestamp: Math.floor(Date.now() / 1000)
      });

      progress = {
        stage: 'Publishing repository events...',
        percentage: 85,
        isComplete: false
      };

      // Sign and publish the announcement event
      const signedAnnouncement = await onSignEvent(announcementEvent);
      await onPublishEvent(signedAnnouncement);

      // Sign and publish the state event
      const signedState = await onSignEvent(stateEvent);
      await onPublishEvent(signedState);

      // Step 4: Update local store
      if (onUpdateStore) {
        progress = {
          stage: 'Updating local repository store...',
          percentage: 95,
          isComplete: false
        };

        await onUpdateStore(repoId, {
          name: config.name,
          description: config.description,
          visibility: config.visibility,
          defaultBranch: config.defaultBranch,
          cloneUrl: updatedCloneUrl
        });
      }

      // Mark as complete
      progress = {
        stage: 'Repository updated successfully!',
        percentage: 100,
        isComplete: true
      };

    } catch (err: any) {
      console.error('Edit repository failed:', err);
      error = err.message || 'Repository update failed';
      
      // Reset progress on error
      progress = undefined;
    } finally {
      isEditing = false;
    }
  }

  /**
   * Reset the edit state
   * Useful for retrying after errors or starting fresh
   */
  function reset(): void {
    progress = undefined;
    error = undefined;
    isEditing = false;
  }

  // Return reactive state and methods
  return {
    // Reactive state (automatically reactive in Svelte 5)
    get progress() { return progress; },
    get error() { return error; },
    get isEditing() { return isEditing; },

    // Methods
    editRepository,
    reset
  };
}
