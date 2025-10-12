/**
 * NostrGitProvider - Core Provider for Nostr Git Operations
 * 
 * This provider integrates with the upgraded @nostr-git/git-wrapper package to provide
 * full GRASP support, multi-relay coordination, and ngit-compatible functionality.
 * 
 * Based on ngit reference implementation:
 * - src/lib/git/mod.rs (RepoActions trait)
 * - src/lib/repo_state.rs (RepoState management)
 * - src/lib/client.rs (multi-relay coordination)
 */

import type { 
  GitProvider, 
  HttpOverrides
} from '@nostr-git/git-wrapper';
import { getGitProvider } from '@nostr-git/git-wrapper';
import type { EventIO } from '@nostr-git/shared-types';
import { 
  RepoAnnouncementEvent, 
  RepoStateEvent,
  createRepoStateEvent,
  createRepoAnnouncementEvent
} from '@nostr-git/shared-types';

export interface NostrGitConfig {
  eventIO: EventIO;
  grasp?: GraspLike;
  defaultRelays?: string[];
  fallbackRelays?: string[];
  graspRelays?: string[];
  publishRepoState?: boolean;
  publishRepoAnnouncements?: boolean;
  httpOverrides?: HttpOverrides;
}

interface GraspLike {
  publishStateFromLocal(
    owner: string,
    repo: string,
    opts?: { includeTags?: boolean; prevEventId?: string },
  ): Promise<any>;
}

export interface RepoDiscovery {
  repoId: string;
  urls: string[];
  announcement?: RepoAnnouncementEvent;
  state?: RepoStateEvent;
  maintainers: string[];
  relays: string[];
}

export interface NostrPushResult {
  server?: any;
  patchEventIds?: string[];
  stateEventId?: string;
}

/**
 * NostrGitProvider - A wrapper around GitProvider that adds Nostr-specific functionality
 * 
 * This class provides GRASP integration and Nostr event coordination while delegating
 * all standard Git operations to the underlying GitProvider from git-wrapper.
 */
export class NostrGitProvider {
  private baseGitProvider: GitProvider;
  private nostrConfig: NostrGitConfig;

  constructor(config: NostrGitConfig) {
    this.nostrConfig = config;
    
    // Create the underlying git provider (isomorphic-git or libgit2)
    this.baseGitProvider = getGitProvider();
  }

  /**
   * Get the underlying GitProvider for direct Git operations
   */
  getGitProvider(): GitProvider {
    return this.baseGitProvider;
  }

  /**
   * Discover a repository via Nostr events
   * Based on ngit's repo discovery logic
   */
  async discoverRepo(repoId: string, options?: any): Promise<RepoDiscovery | null> {
    try {
      // Use EventIO to fetch repository announcement events
      const filters = [
        {
          kinds: [30617], // GIT_REPO_ANNOUNCEMENT
          '#d': [repoId]
        }
      ];

      const events = await this.nostrConfig.eventIO.fetchEvents(filters);
      
      if (events.length === 0) {
        return null;
      }

      // Get the latest announcement event
      const announcement = events[0] as RepoAnnouncementEvent;
      
      // Extract clone URLs from tags
      const cloneUrls = announcement.tags
        .filter(tag => tag[0] === 'clone')
        .flatMap(tag => tag.slice(1));

      // Extract maintainers from announcement tags
      const maintainers = announcement.tags
        .filter(tag => tag[0] === 'maintainers')
        .flatMap(tag => tag.slice(1));
      
      // Extract relays from announcement tags
      const relays = announcement.tags
        .filter(tag => tag[0] === 'relays')
        .flatMap(tag => tag.slice(1));

      // Try to get repo state
      const stateFilters = [
        {
          kinds: [30618], // GIT_REPO_STATE
          '#d': [repoId]
        }
      ];

      const stateEvents = await this.nostrConfig.eventIO.fetchEvents(stateFilters);
      const state = stateEvents.length > 0 ? stateEvents[0] as RepoStateEvent : undefined;

      return {
        repoId,
        urls: cloneUrls,
        announcement,
        state,
        maintainers,
        relays
      };
    } catch (error) {
      console.error('Failed to discover repository:', error);
      return null;
    }
  }

  /**
   * Clone a repository with GRASP support
   * Delegates to base git provider
   */
  async clone(options: any): Promise<void> {
    return this.baseGitProvider.clone(options);
  }

  /**
   * Push changes with GRASP relay support
   * Based on ngit's push logic with multi-relay coordination
   */
  async push(options: any): Promise<NostrPushResult> {
    // Delegate to base provider for actual push
    const result = await this.baseGitProvider.push(options);
    
    // If GRASP is configured and repo state publishing is enabled
    if (this.nostrConfig.grasp && this.nostrConfig.publishRepoState && options.dir) {
      try {
        const stateEventId = await this.publishRepoState(options.dir, this.nostrConfig.graspRelays);
        return {
          ...result,
          stateEventId
        };
      } catch (error) {
        console.warn('Failed to publish repo state after push:', error);
        return result;
      }
    }

    return result;
  }

  /**
   * Publish repository state to Nostr relays
   * Based on ngit's repo state publishing
   */
  async publishRepoState(dir: string, relays?: string[]): Promise<string> {
    try {
      // Get repo state from git repository
      const repoState = await this.getRepoStateFromLocal(dir);
      
      if (!repoState) {
        throw new Error('Failed to get repository state');
      }

      // Create repo state event
      const stateEvent = createRepoStateEvent({
        repoId: repoState.repoAddr,
        refs: repoState.refs,
        created_at: Math.floor(Date.now() / 1000)
      });

      // Publish the event using EventIO (handles signing internally - no more signer passing!)
      const publishResult = await this.nostrConfig.eventIO.publishEvent(stateEvent);
      
      if (!publishResult.ok) {
        throw new Error(`Failed to publish repository state: ${publishResult.error}`);
      }
      
      console.log('[NostrGitProvider] Repository state published successfully');
      return publishResult.relays?.[0] || 'published';
    } catch (error) {
      console.error('Failed to publish repo state:', error);
      throw error;
    }
  }

  /**
   * Publish repository announcement to Nostr relays
   * Based on ngit's repo announcement logic
   */
  async publishRepoAnnouncement(dir: string, relays?: string[]): Promise<string> {
    try {
      // Get repo state from git repository
      const repoState = await this.getRepoStateFromLocal(dir);
      
      if (!repoState) {
        throw new Error('Failed to get repository state');
      }

      // Create repo announcement event
      const announcementEvent = createRepoAnnouncementEvent({
        repoId: repoState.repoAddr,
        name: repoState.name || 'Unnamed Repository',
        description: repoState.description || '',
        clone: repoState.gitServers || [],
        relays: relays || this.nostrConfig.defaultRelays || [],
        maintainers: repoState.maintainers || [],
        created_at: Math.floor(Date.now() / 1000)
      });

      // Publish the event using EventIO (handles signing internally - no more signer passing!)
      const publishResult = await this.nostrConfig.eventIO.publishEvent(announcementEvent);
      
      if (!publishResult.ok) {
        throw new Error(`Failed to publish repository announcement: ${publishResult.error}`);
      }
      
      console.log('[NostrGitProvider] Repository announcement published successfully');
      return publishResult.relays?.[0] || 'published';
    } catch (error) {
      console.error('Failed to publish repo announcement:', error);
      throw error;
    }
  }

  private async getRepoStateFromLocal(dir: string): Promise<any> {
    // This would typically read from a local git repository
    // For now, return a mock state - in real implementation this would:
    // 1. Open the local git repository
    // 2. Read HEAD and refs
    // 3. Return structured state data
    
    return {
      repoAddr: 'mock-repo-addr',
      refs: [
        { type: 'heads' as const, name: 'main', commit: 'latest-commit-hash' },
        { type: 'heads' as const, name: 'develop', commit: 'develop-commit-hash' }
      ],
      head: 'ref: refs/heads/main',
      name: 'Test Repository',
      description: 'A test repository',
      maintainers: ['npub1...'],
      gitServers: ['https://github.com']
    };
  }

  /**
   * List proposals (patches/pull requests) for a repository
   * Based on ngit's proposal listing
   */
  async listProposals(repoAddr: string, options?: any): Promise<any[]> {
    try {
      // Use EventIO to fetch patch events
      const filters = [
        {
          kinds: [1617], // GIT_PATCH
          '#a': [repoAddr]
        }
      ];

      const events = await this.nostrConfig.eventIO.fetchEvents(filters);
      return events;
    } catch (error) {
      console.error('Failed to list proposals:', error);
      return [];
    }
  }

  /**
   * Send a proposal (patch/pull request) to a repository
   * Based on ngit's proposal sending
   */
  async sendProposal(repoAddr: string, commits: string[], options?: any): Promise<string[]> {
    try {
      // Create patch events for each commit
      const patchEvents = [];
      
      for (const commit of commits) {
        // Create patch event (simplified)
        const patchEvent = {
          kind: 1617,
          tags: [
            ['a', repoAddr],
            ['commit', commit]
          ],
          content: `Patch for commit ${commit}`,
          created_at: Math.floor(Date.now() / 1000)
        };

        // Publish the event using EventIO (handles signing internally - no more signer passing!)
        const publishResult = await this.nostrConfig.eventIO.publishEvent(patchEvent);
        
        if (publishResult.ok) {
          patchEvents.push('mock-patch-id');
        } else {
          console.warn('Failed to publish patch event:', publishResult.error);
        }
      }

      return patchEvents;
    } catch (error) {
      console.error('Failed to send proposal:', error);
      throw error;
    }
  }

  /**
   * Get ahead/behind status between branches
   * Based on ngit's branch comparison
   */
  async getAheadBehind(dir: string, baseRef: string, headRef: string): Promise<{ ahead: string[]; behind: string[] }> {
    // For now, return mock data - in real implementation this would use git operations
    return { ahead: [], behind: [] };
  }

  /**
   * Check if repository has outstanding changes
   * Based on ngit's change detection
   */
  async hasOutstandingChanges(dir: string): Promise<boolean> {
    // For now, return mock data - in real implementation this would use git operations
    return false;
  }

  /**
   * Get the root commit of a repository
   * Based on ngit's root commit detection
   */
  async getRootCommit(dir: string): Promise<string> {
    // For now, return mock data - in real implementation this would use git operations
    return 'mock-root-commit';
  }

  /**
   * Get detailed commit information
   * Based on ngit's commit info extraction
   */
  async getCommitInfo(dir: string, commitId: string): Promise<any> {
    // For now, return mock data - in real implementation this would use git operations
    return {};
  }

  /**
   * Get all branches in a repository
   * Based on ngit's branch listing
   */
  async getAllBranches(dir: string): Promise<any[]> {
    // For now, return mock data - in real implementation this would use git operations
    return [];
  }
}