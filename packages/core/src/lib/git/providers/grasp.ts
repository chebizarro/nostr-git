/**
 * GRASP Git Relay API Implementation
 * 
 * Implements the GitServiceApi interface for GRASP (Git Relays Authorized via Signed-Nostr Proofs).
 * Uses Nostr for authorization and coordination, with Git repositories hosted over Smart HTTP.
 * 
 * GRASP Specification: https://github.com/nostr-protocol/nips/pull/XXX
 */

import type { 
  GitServiceApi, 
  RepoMetadata, 
  Commit, 
  Issue, 
  PullRequest, 
  Patch, 
  NewIssue, 
  NewPullRequest, 
  ListCommitsOptions, 
  ListIssuesOptions, 
  ListPullRequestsOptions, 
  User, 
  GitForkOptions 
} from '../api.js';
import { SimplePool, type EventTemplate, type NostrEvent, nip19 } from 'nostr-tools';

// Import or declare the requestEventSigning function
declare const requestEventSigning: ((event: EventTemplate) => Promise<NostrEvent>) | undefined;

/**
 * Signer interface for signing Nostr events
 */
export interface Signer {
  signEvent(event: EventTemplate): Promise<NostrEvent>;
  getPublicKey(): Promise<string>;
}

/**
 * NIP-11 relay information
 */
interface RelayInfo {
  name?: string;
  description?: string;
  pubkey?: string;
  contact?: string;
  supported_nips?: number[];
  supported_grasps?: string[];
  software?: string;
  version?: string;
}

/**
 * GRASP API client implementing GitServiceApi
 */
export class GraspApi implements GitServiceApi {
  private readonly relayUrl: string;
  private readonly pubkey: string;
  private readonly signer: Signer;
  private readonly pool: SimplePool;
  private relayInfo?: RelayInfo;

  constructor(relayUrl: string, pubkey: string, signer: Signer) {
    this.relayUrl = relayUrl.replace(/\/$/, ''); // Remove trailing slash
    this.pubkey = pubkey;
    this.signer = signer;
    this.pool = new SimplePool();
  }

  /**
   * Get relay information via NIP-11
   */
  private async getRelayInfo(): Promise<RelayInfo> {
    if (this.relayInfo) {
      return this.relayInfo;
    }

    try {
      const infoUrl = this.relayUrl.replace('ws://', 'http://').replace('wss://', 'https://');
      const response = await fetch(infoUrl, {
        headers: {
          'Accept': 'application/nostr+json',
        },
      });

      if (response.ok) {
        this.relayInfo = await response.json();
        return this.relayInfo!;
      }
    } catch (error) {
      console.warn('Failed to fetch relay info:', error);
    }

    // Fallback to empty info
    this.relayInfo = {};
    return this.relayInfo;
  }

  /**
   * Check if GRASP is supported by the relay
   */
  private async isGraspSupported(): Promise<boolean> {
    const info = await this.getRelayInfo();
    return info.supported_grasps?.includes('GRASP-01') || false;
  }

  /**
   * Make authenticated Git Smart HTTP request
   */
  private async gitRequest(npub: string, repo: string, endpoint: string, options: RequestInit = {}): Promise<Response> {
    const gitUrl = `${this.relayUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/${npub}/${repo}.git${endpoint}`;
    
    return fetch(gitUrl, {
      ...options,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'User-Agent': 'nostr-git-grasp-client',
        ...options.headers,
      },
    });
  }

  /**
   * Publish Nostr event to relay
   */
  private async publishEvent(event: EventTemplate): Promise<NostrEvent> {
    let signedEvent;
    
    // Check if we're in a worker context and need to use the message-based signing protocol
    if (typeof requestEventSigning === 'function') {
      console.log('Using message-based signing protocol for GRASP event');
      try {
        // Request signing from the UI thread
        signedEvent = await requestEventSigning(event);
      } catch (error) {
        throw new Error(`Failed to sign event via message protocol: ${error}`);
      }
    } else {
      // Direct signing when not in worker context or for backward compatibility
      console.log('Using direct signing for GRASP event');
      signedEvent = await this.signer.signEvent(event);
    }
    
    // Simplified approach using the pool directly
    try {
      await this.pool.publish([this.relayUrl], signedEvent);
      return signedEvent;
    } catch (error) {
      throw new Error(`Failed to publish event: ${error}`);
    }
  }

  /**
   * Query Nostr events from relay
   */
  private async queryEvents(filter: any): Promise<NostrEvent[]> {
    return new Promise((resolve) => {
      const events: NostrEvent[] = [];
      const sub = this.pool.subscribeMany([this.relayUrl], [filter], {
        onevent: (event: NostrEvent) => {
          events.push(event);
        },
        oneose: () => {
          sub.close();
          resolve(events);
        },
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        sub.close();
        resolve(events);
      }, 5000);
    });
  }

  /**
   * Repository Operations
   */
  async getRepo(owner: string, repo: string): Promise<RepoMetadata> {
    // Query for repository announcement event (NIP-34 kind 30617)
    const events = await this.queryEvents({
      kinds: [30617],
      authors: [owner],
      '#d': [repo],
      limit: 1,
    });

    if (events.length === 0) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    const event = events[0];
    const nameTag = event.tags.find(t => t[0] === 'name')?.[1] || repo;
    const descTag = event.tags.find(t => t[0] === 'description')?.[1] || '';
    const cloneTag = event.tags.find(t => t[0] === 'clone')?.[1] || '';
    const webTag = event.tags.find(t => t[0] === 'web')?.[1] || '';
    
    const npub = nip19.npubEncode(owner);
    
    return {
      id: event.id,
      name: nameTag,
      fullName: `${npub}/${nameTag}`,
      description: descTag,
      defaultBranch: 'main', // TODO: Extract from repo state event
      isPrivate: false, // GRASP repos are typically public
      cloneUrl: cloneTag || `${this.relayUrl}/${npub}/${repo}.git`,
      htmlUrl: webTag || `${this.relayUrl}/${npub}/${repo}`,
      owner: {
        login: npub,
        type: 'User',
      },
    };
  }

  async createRepo(options: { name: string; description?: string; private?: boolean; autoInit?: boolean }): Promise<RepoMetadata> {
    // Publish repository announcement event (NIP-34 kind 30617)
    const event: EventTemplate = {
      kind: 30617,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', options.name],
        ['name', options.name],
        ['description', options.description || ''],
        ['clone', `${this.relayUrl}/${nip19.npubEncode(this.pubkey)}/${options.name}.git`],
        ['web', `${this.relayUrl}/${nip19.npubEncode(this.pubkey)}/${options.name}`],
        ['relays', this.relayUrl],
      ],
      content: options.description || '',
    };

    await this.publishEvent(event);

    const npub = nip19.npubEncode(this.pubkey);
    return {
      id: '', // Will be set after event is published
      name: options.name,
      fullName: `${npub}/${options.name}`,
      description: options.description || '',
      defaultBranch: 'main',
      isPrivate: options.private || false,
      cloneUrl: `${this.relayUrl}/${npub}/${options.name}.git`,
      htmlUrl: `${this.relayUrl}/${npub}/${options.name}`,
      owner: {
        login: npub,
        type: 'User',
      },
    };
  }

  async updateRepo(owner: string, repo: string, updates: { name?: string; description?: string; private?: boolean }): Promise<RepoMetadata> {
    // Update repository announcement event
    const currentRepo = await this.getRepo(owner, repo);
    
    const event: EventTemplate = {
      kind: 30617,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', updates.name || repo],
        ['name', updates.name || currentRepo.name],
        ['description', updates.description || currentRepo.description || ''],
        ['clone', currentRepo.cloneUrl || ''],
        ['web', currentRepo.htmlUrl || ''],
        ['relays', this.relayUrl],
      ],
      content: updates.description || currentRepo.description || '',
    };

    await this.publishEvent(event);
    
    return {
      ...currentRepo,
      name: updates.name || currentRepo.name,
      description: updates.description || currentRepo.description,
    };
  }

  async forkRepo(owner: string, repo: string, options?: GitForkOptions): Promise<RepoMetadata> {
    // For GRASP, forking means creating a new repo announcement that references the original
    const originalRepo = await this.getRepo(owner, repo);
    const forkName = options?.name || `${repo}-fork`;
    
    const npub = nip19.npubEncode(this.pubkey);
    const event: EventTemplate = {
      kind: 30617,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', forkName],
        ['name', forkName],
        ['description', `Fork of ${originalRepo.fullName}`],
        ['clone', `${this.relayUrl}/${npub}/${forkName}.git`],
        ['web', `${this.relayUrl}/${npub}/${forkName}`],
        ['relays', this.relayUrl],
        ['fork', originalRepo.cloneUrl], // Reference to original
      ],
      content: `Fork of ${originalRepo.fullName}`,
    };

    await this.publishEvent(event);

    return {
      id: '',
      name: forkName,
      fullName: `${npub}/${forkName}`,
      description: `Fork of ${originalRepo.fullName}`,
      defaultBranch: originalRepo.defaultBranch,
      isPrivate: false,
      cloneUrl: `${this.relayUrl}/${npub}/${forkName}.git`,
      htmlUrl: `${this.relayUrl}/${npub}/${forkName}`,
      owner: {
        login: npub,
        type: 'User',
      },
    };
  }

  /**
   * Commit Operations
   */
  async listCommits(owner: string, repo: string, options?: ListCommitsOptions): Promise<Commit[]> {
    // For GRASP, we need to use Git Smart HTTP to fetch commits
    const npub = nip19.npubEncode(owner);
    
    try {
      // This would require implementing Git Smart HTTP protocol parsing
      // For now, return empty array as fallback
      console.warn('GRASP listCommits not fully implemented - requires Git Smart HTTP parsing');
      return [];
    } catch (error) {
      console.error('Failed to list commits:', error);
      return [];
    }
  }

  async getCommit(owner: string, repo: string, sha: string): Promise<Commit> {
    // Similar to listCommits, would require Git Smart HTTP implementation
    throw new Error('GRASP getCommit not implemented - requires Git Smart HTTP parsing');
  }

  /**
   * Issue Operations
   */
  async listIssues(owner: string, repo: string, options?: ListIssuesOptions): Promise<Issue[]> {
    // Query for issue events (NIP-34 kind 1621)
    const repoId = `${nip19.npubEncode(owner)}:${repo}`;
    const events = await this.queryEvents({
      kinds: [1621],
      '#a': [repoId],
      limit: options?.per_page || 30,
    });

    return events.map(event => ({
      id: parseInt(event.id.slice(-8), 16), // Use last 8 chars of event ID as number
      number: parseInt(event.id.slice(-8), 16),
      title: event.tags.find(t => t[0] === 'subject')?.[1] || 'Untitled',
      body: event.content,
      state: event.tags.find(t => t[0] === 'closed')? 'closed' : 'open',
      author: {
        login: nip19.npubEncode(event.pubkey),
        avatarUrl: undefined,
      },
      assignees: [],
      labels: event.tags.filter(t => t[0] === 'label').map(t => ({
        name: t[1],
        color: '#000000',
        description: undefined,
      })),
      createdAt: new Date(event.created_at * 1000).toISOString(),
      updatedAt: new Date(event.created_at * 1000).toISOString(),
      closedAt: event.tags.find(t => t[0] === 'closed')?.[1],
      url: `nostr:${nip19.neventEncode({ id: event.id, relays: [this.relayUrl] })}`,
      htmlUrl: `${this.relayUrl}/issues/${event.id}`,
    }));
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<Issue> {
    const issues = await this.listIssues(owner, repo);
    const issue = issues.find(i => i.number === issueNumber);
    
    if (!issue) {
      throw new Error(`Issue #${issueNumber} not found`);
    }
    
    return issue;
  }

  async createIssue(owner: string, repo: string, issue: NewIssue): Promise<Issue> {
    const repoId = `${nip19.npubEncode(owner)}:${repo}`;
    
    const event: EventTemplate = {
      kind: 1621,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['a', repoId],
        ['subject', issue.title],
        ...(issue.labels?.map(label => ['label', label]) || []),
      ],
      content: issue.body || '',
    };

    const publishedEvent = await this.publishEvent(event);
    
    return {
      id: parseInt(publishedEvent.id.slice(-8), 16),
      number: parseInt(publishedEvent.id.slice(-8), 16),
      title: issue.title,
      body: issue.body || '',
      state: 'open',
      author: {
        login: nip19.npubEncode(this.pubkey),
        avatarUrl: undefined,
      },
      assignees: [],
      labels: issue.labels?.map(label => ({
        name: label,
        color: '#000000',
        description: undefined,
      })) || [],
      createdAt: new Date(publishedEvent.created_at * 1000).toISOString(),
      updatedAt: new Date(publishedEvent.created_at * 1000).toISOString(),
      closedAt: undefined,
      url: `nostr:${nip19.neventEncode({ id: publishedEvent.id, relays: [this.relayUrl] })}`,
      htmlUrl: `${this.relayUrl}/issues/${publishedEvent.id}`,
    };
  }

  async updateIssue(owner: string, repo: string, issueNumber: number, updates: Partial<NewIssue>): Promise<Issue> {
    // For Nostr, we'd typically create a new event that references the original
    // This is a simplified implementation
    throw new Error('GRASP updateIssue not implemented - requires event replacement strategy');
  }

  async closeIssue(owner: string, repo: string, issueNumber: number): Promise<Issue> {
    // Create a close event that references the original issue
    const issue = await this.getIssue(owner, repo, issueNumber);
    
    // This would require finding the original event and creating a close event
    throw new Error('GRASP closeIssue not implemented - requires close event creation');
  }

  /**
   * Pull Request Operations (mapped to patches in GRASP)
   */
  async listPullRequests(owner: string, repo: string, options?: ListPullRequestsOptions): Promise<PullRequest[]> {
    // Map to patch operations
    const patches = await this.listPatches(owner, repo);
    
    return patches.map(patch => ({
      id: parseInt(patch.id.slice(-8), 16),
      number: parseInt(patch.id.slice(-8), 16),
      title: patch.title,
      body: patch.description,
      state: 'open', // Patches don't have explicit state
      author: patch.author,
      head: {
        ref: 'patch-branch',
        sha: patch.commits[0]?.sha || '',
        repo: { name: repo, owner: nip19.npubEncode(owner) },
      },
      base: {
        ref: 'main',
        sha: '',
        repo: { name: repo, owner: nip19.npubEncode(owner) },
      },
      mergeable: undefined,
      merged: false,
      mergedAt: undefined,
      createdAt: patch.createdAt,
      updatedAt: patch.updatedAt,
      url: `nostr:${patch.id}`,
      htmlUrl: `${this.relayUrl}/patches/${patch.id}`,
      diffUrl: `${this.relayUrl}/patches/${patch.id}.diff`,
      patchUrl: `${this.relayUrl}/patches/${patch.id}.patch`,
    }));
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequest> {
    const prs = await this.listPullRequests(owner, repo);
    const pr = prs.find(p => p.number === prNumber);
    
    if (!pr) {
      throw new Error(`Pull request #${prNumber} not found`);
    }
    
    return pr;
  }

  async createPullRequest(owner: string, repo: string, pr: NewPullRequest): Promise<PullRequest> {
    throw new Error('GRASP createPullRequest not implemented - use patch workflow instead');
  }

  async updatePullRequest(owner: string, repo: string, prNumber: number, updates: Partial<NewPullRequest>): Promise<PullRequest> {
    throw new Error('GRASP updatePullRequest not implemented - use patch workflow instead');
  }

  async mergePullRequest(owner: string, repo: string, prNumber: number, options?: { commitTitle?: string; commitMessage?: string; mergeMethod?: 'merge' | 'squash' | 'rebase' }): Promise<PullRequest> {
    throw new Error('GRASP mergePullRequest not implemented - use patch workflow instead');
  }

  /**
   * Patch Operations (native to GRASP/NIP-34)
   */
  async listPatches(owner: string, repo: string): Promise<Patch[]> {
    // Query for patch events (NIP-34 kind 1617)
    const repoId = `${nip19.npubEncode(owner)}:${repo}`;
    const events = await this.queryEvents({
      kinds: [1617],
      '#a': [repoId],
      limit: 50,
    });

    return events.map(event => ({
      id: event.id,
      title: event.tags.find(t => t[0] === 'subject')?.[1] || 'Untitled Patch',
      description: event.content,
      author: {
        login: nip19.npubEncode(event.pubkey),
        avatarUrl: undefined,
      },
      commits: [], // Would need to parse from patch content
      files: [], // Would need to parse from patch content
      createdAt: new Date(event.created_at * 1000).toISOString(),
      updatedAt: new Date(event.created_at * 1000).toISOString(),
    }));
  }

  async getPatch(owner: string, repo: string, patchId: string): Promise<Patch> {
    const patches = await this.listPatches(owner, repo);
    const patch = patches.find(p => p.id === patchId);
    
    if (!patch) {
      throw new Error(`Patch ${patchId} not found`);
    }
    
    return patch;
  }

  /**
   * User Operations
   */
  async getCurrentUser(): Promise<User> {
    const npub = nip19.npubEncode(this.pubkey);
    
    // Query for profile metadata (NIP-01 kind 0)
    const events = await this.queryEvents({
      kinds: [0],
      authors: [this.pubkey],
      limit: 1,
    });

    let profile: any = {};
    if (events.length > 0) {
      try {
        profile = JSON.parse(events[0].content);
      } catch (error) {
        console.warn('Failed to parse profile metadata:', error);
      }
    }

    return {
      login: npub,
      id: parseInt(this.pubkey.slice(-8), 16),
      avatarUrl: profile.picture || '',
      name: profile.name,
      email: undefined, // Not typically in Nostr profiles
      bio: profile.about,
      company: undefined,
      location: undefined,
      blog: profile.website,
      htmlUrl: `${this.relayUrl}/users/${npub}`,
    };
  }

  async getUser(username: string): Promise<User> {
    // Assume username is npub format
    let pubkey: string;
    try {
      const decoded = nip19.decode(username);
      if (decoded.type !== 'npub') {
        throw new Error('Invalid npub format');
      }
      pubkey = decoded.data;
    } catch (error) {
      throw new Error(`Invalid user identifier: ${username}`);
    }

    const events = await this.queryEvents({
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    });

    let profile: any = {};
    if (events.length > 0) {
      try {
        profile = JSON.parse(events[0].content);
      } catch (error) {
        console.warn('Failed to parse profile metadata:', error);
      }
    }

    return {
      login: username,
      id: parseInt(pubkey.slice(-8), 16),
      avatarUrl: profile.picture || '',
      name: profile.name,
      email: undefined,
      bio: profile.about,
      company: undefined,
      location: undefined,
      blog: profile.website,
      htmlUrl: `${this.relayUrl}/users/${username}`,
    };
  }

  /**
   * Repository Content Operations
   */
  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<{ content: string; encoding: string; sha: string }> {
    // Would require Git Smart HTTP implementation to fetch file content
    throw new Error('GRASP getFileContent not implemented - requires Git Smart HTTP parsing');
  }

  /**
   * Branch Operations
   */
  async listBranches(owner: string, repo: string): Promise<Array<{ name: string; commit: { sha: string; url: string } }>> {
    // Would require Git Smart HTTP implementation
    throw new Error('GRASP listBranches not implemented - requires Git Smart HTTP parsing');
  }

  async getBranch(owner: string, repo: string, branch: string): Promise<{ name: string; commit: { sha: string; url: string }; protected: boolean }> {
    throw new Error('GRASP getBranch not implemented - requires Git Smart HTTP parsing');
  }

  /**
   * Tag Operations
   */
  async listTags(owner: string, repo: string): Promise<Array<{ name: string; commit: { sha: string; url: string } }>> {
    throw new Error('GRASP listTags not implemented - requires Git Smart HTTP parsing');
  }

  async getTag(owner: string, repo: string, tag: string): Promise<{ name: string; commit: { sha: string; url: string }; zipballUrl: string; tarballUrl: string }> {
    throw new Error('GRASP getTag not implemented - requires Git Smart HTTP parsing');
  }
}
