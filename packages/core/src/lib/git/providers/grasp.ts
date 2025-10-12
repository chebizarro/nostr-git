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
import { nip19, type EventTemplate, type Filter as NostrFilter, type Event as NostrEvent } from 'nostr-tools';
import { getTagValue, getTags, type EventIO } from '@nostr-git/shared-types';
import {
  fetchRelayInfo,
  graspCapabilities as detectCapabilities,
  normalizeHttpOrigin,
  type GraspCapabilities,
  type RelayInfo
} from './grasp-capabilities.js';
import {
  encodeRepoAddress,
  parseRepoStateFromEvent,
  getDefaultBranchFromHead,
  buildStateEventTemplate,
  type RepoState
} from './grasp-state.js';
import { createMemFs } from './grasp-fs.js';
import * as git from 'isomorphic-git';
// @ts-ignore - isomorphic-git/http/web has type issues
import http from 'isomorphic-git/http/web';

// Import or declare the requestEventSigning function - DEPRECATED
// This is no longer needed with EventIO
declare const requestEventSigning: ((event: EventTemplate) => Promise<NostrEvent>) | undefined;

/**
 * GRASP Git Relay API Implementation - CLEAN VERSION
 *
 * Implements the GitServiceApi interface for GRASP (Git Relays Authorized via Signed-Nostr Proofs).
 * Uses Nostr for authorization and coordination, with Git repositories hosted over Smart HTTP.
 *
 * IMPORTANT: This uses EventIO instead of the cursed SignEvent passing pattern.
 * The Signer interface has been completely vaporized!
 */

/**
 * GRASP API client implementing GitServiceApi
 */
export class GraspApi implements GitServiceApi {
  private capabilities?: GraspCapabilities;
  private httpBase?: string;
  private readonly relayUrl: string;
  private readonly pubkey: string;
  private readonly eventIO: EventIO;
  private relayInfo?: RelayInfo;

  constructor(
    relayUrl: string,
    pubkey: string,
    eventIO: EventIO
  ) {
    // Normalize to base ws(s) origin with no path
    let normalized = relayUrl.replace(/\/$/, '');
    try {
      const u = new URL(relayUrl);
      const origin = `${u.protocol}//${u.host}`;
      normalized = origin.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
    } catch {
      normalized = relayUrl
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://')
        .replace(/(ws[s]?:\/\/[^/]+).*/, '$1');
    }
    this.relayUrl = normalized;
    this.pubkey = pubkey;
    this.eventIO = eventIO;
  }

  /**
   * Load NIP-11 info and capability metadata for relay, caching results.
   * Mirrors logic from ngit to establish smart-HTTP and GRASP support.
   */
  private async ensureCapabilities(force = false): Promise<void> {
    if (this.capabilities && this.httpBase && !force) return;
    try {
      // Mirrors ngit client.rs: uses NIP-11 to get relay info and advertise smart_http endpoints
      const info = await fetchRelayInfo(this.relayUrl);
      this.capabilities = detectCapabilities(info, this.relayUrl);
      this.httpBase = this.capabilities.httpOrigins?.[0] || normalizeHttpOrigin(this.relayUrl);
      this.relayInfo = info;
    } catch (err) {
      console.warn('Failed to ensure capabilities:', err);
      if (!this.httpBase) {
        this.httpBase = normalizeHttpOrigin(this.relayUrl);
      }
    }
  }

  /** Determine if a relay URL is suitable for Nostr relay connections */
  private isValidNostrRelayUrl(url: string): boolean {
    try {
      const u = new URL(url);
      if (!(u.protocol === 'ws:' || u.protocol === 'wss:')) return false;
      const host = u.hostname.toLowerCase();
      // Allow localhost and loopback
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
      // Reject known dev-only alias host
      if (host === 'ngit-relay') return false;
      // Require a dot in hostname for public hosts (rudimentary check)
      return host.includes('.');
    } catch {
      return false;
    }
  }


  /**
   * Check if GRASP is supported by the relay
   */
  private async isGraspSupported(): Promise<boolean> {
    await this.ensureCapabilities();
    return this.relayInfo?.supported_grasps?.includes('GRASP-01') || false;
  }

  /**
   * Make authenticated Git Smart HTTP request
   */
  private async gitRequest(
    npub: string,
    repo: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    await this.ensureCapabilities();
    const httpOrigin = this.httpBase || normalizeHttpOrigin(this.relayUrl);
    const gitUrl = `${httpOrigin}/${npub}/${repo}.git${endpoint}`;

    return fetch(gitUrl, {
      ...options,
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'User-Agent': 'nostr-git-grasp-client',
        ...options.headers
      }
    });
  }

  /**
   * Publish Nostr event to relay - CLEAN VERSION
   * Uses EventIO which handles signing internally - no more signer passing!
   */
  private async publishEvent(event: EventTemplate): Promise<NostrEvent> {
    try {
      // Clean approach - just pass the unsigned event, EventIO handles signing internally
      const result = await this.eventIO.publishEvent(event);
      if (!result.ok) throw new Error(result.error || 'publish failed');
      
      // Return the event with the ID from the result
      // Note: EventIO doesn't return the signed event, so we reconstruct it
      // This is a limitation we'll need to address in the EventIO interface
      return event as NostrEvent; // TODO: EventIO should return the signed event
    } catch (error) {
      throw new Error(`Failed to publish event: ${error}`);
    }
  }

  /**
   * Query Nostr events from relay using EventIO
   */
  private async queryEvents(filters: NostrFilter[]): Promise<NostrEvent[]> {
    try {
      // Use EventIO to fetch events (delegates to app's Welshman infrastructure)
      const events = await this.eventIO.fetchEvents(filters as any);
      return events;
    } catch (error) {
      console.error('Failed to query events:', error);
      return [];
    }
  }

  /**
   * Get current GRASP capabilities of the relay
   */
  public async getCapabilities(): Promise<GraspCapabilities> {
    await this.ensureCapabilities();
    return this.capabilities!;
  }

  /**
   * Get relay information via NIP-11
   */
  public async getRelayInfo(): Promise<RelayInfo> {
    await this.ensureCapabilities();
    return this.relayInfo ?? {};
  }

  /**
   * Repository Operations
   */
  async getRepo(owner: string, repo: string): Promise<RepoMetadata> {
    await this.ensureCapabilities();

    // Query both announcement and state events in parallel
    const repoAddr = encodeRepoAddress(owner, repo);
    const [announceEvents, stateEvents] = await Promise.all([
      this.queryEvents([
        { kinds: [30617], authors: [owner], '#d': [repo], limit: 1 }
      ]),
      this.queryEvents([
        { kinds: [31990], '#a': [repoAddr], limit: 1 }
      ])
    ]);

    if (announceEvents.length === 0 && stateEvents.length === 0) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    const announceEvent = announceEvents[0];
    const stateEvent = stateEvents[0];
    const state: RepoState | null = stateEvent ? parseRepoStateFromEvent(stateEvent) : null;

    const npub = nip19.npubEncode(owner);
    const nameTag = announceEvent ? getTagValue(announceEvent as any, 'name') || repo : repo;
    const descTag = announceEvent ? getTagValue(announceEvent as any, 'description') || '' : '';
    const cloneTag = announceEvent ? getTagValue(announceEvent as any, 'clone') || '' : '';
    const webTag = announceEvent ? getTagValue(announceEvent as any, 'web') || '' : '';

    // Default branch comes from state HEAD if present
    const defaultBranch = state?.head ? getDefaultBranchFromHead(state.head) : 'main';

    const httpOrigin = this.httpBase || normalizeHttpOrigin(this.relayUrl);

    return {
      id: announceEvent?.id ?? stateEvent?.id ?? '',
      name: nameTag,
      fullName: `${npub}/${nameTag}`,
      description: descTag,
      defaultBranch,
      isPrivate: false,
      cloneUrl: cloneTag || `${httpOrigin}/${npub}/${repo}.git`,
      htmlUrl: webTag || `${httpOrigin}/${npub}/${repo}`,
      owner: {
        login: npub,
        type: 'User'
      }
    };
  }

  async publishStateFromLocal(
    owner: string,
    repo: string,
    opts?: { includeTags?: boolean; prevEventId?: string }
  ): Promise<NostrEvent | null> {
    await this.ensureCapabilities();
    if (!this.capabilities?.grasp01) {
      console.warn('Relay does not support GRASP-01');
      return null;
    }
    const npub = nip19.npubEncode(owner);
    const httpOrigin = this.httpBase || normalizeHttpOrigin(this.relayUrl);
    const remoteUrl = `${httpOrigin}/${npub}/${repo}.git`;
    try {
      // Mirrors ngit repo_state.rs: build HEAD refs, collect branch/tag refs, and include nostr refs
      const fs = createMemFs();
      const dir = '/grasp';
      await git.fetch({ fs, http, dir, url: remoteUrl, depth: 1 });
      // construct state from fetched refs - consistent with ngit repo_state.rs::build_state_event
      const branches = await git.listBranches({ fs, dir });
      const tags = opts?.includeTags ? await git.listTags({ fs, dir }) : [];
      const refs: Record<string, string> = {};
      for (const b of branches) {
        try {
          const sha = await git.resolveRef({ fs, dir, ref: `refs/heads/${b}` });
          refs[`refs/heads/${b}`] = sha;
        } catch {}
      }
      if (opts?.includeTags) {
        for (const t of tags) {
          try {
            const sha = await git.resolveRef({ fs, dir, ref: `refs/tags/${t}` });
            refs[`refs/tags/${t}`] = sha;
          } catch {}
        }
      }
      // HEAD management matches ngit logic that prioritizes HEAD ref resolution
      let headRef = 'refs/heads/main';
      try {
        const resolvedHead = await git.resolveRef({ fs, dir, ref: 'HEAD' });
        headRef = resolvedHead.startsWith('refs/')
          ? resolvedHead
          : `refs/heads/${resolvedHead}`;
      } catch {}
      const nostrRefs: string[] = [];
      for (const key of Object.keys(refs)) {
        if (key.startsWith('refs/nostr/')) {
          nostrRefs.push(key.replace('refs/nostr/', ''));
        }
      }
      const state: RepoState = {
        address: encodeRepoAddress(owner, repo),
        head: headRef,
        refs,
        nostrRefs,
        updatedAt: Math.floor(Date.now() / 1000)
      };
      const event = buildStateEventTemplate(state);
      if (opts?.prevEventId) {
        event.tags.push(['prev', opts.prevEventId]);
      }
      // Event publication mirrors ngit git_events.rs::emit_repo_state_event
      const published = await this.publishEvent(event);
      return published;
    } catch (err) {
      console.error('publishStateFromLocal failed:', err);
      throw new Error(`Failed to publish state event: ${err}`);
    }
  }

  async createRepo(options: {
    name: string;
    description?: string;
    private?: boolean;
    autoInit?: boolean;
  }): Promise<RepoMetadata> {
    // Publish repository announcement event (NIP-34 kind 30617)
    console.log('[GraspApi] createRepo - pubkey:', this.pubkey);
    console.log('[GraspApi] createRepo - pubkey length:', this.pubkey.length);
    console.log('[GraspApi] createRepo - pubkey type:', typeof this.pubkey);
    
    const npub = nip19.npubEncode(this.pubkey);
    console.log('[GraspApi] createRepo - npub:', npub);
    
    const httpBase = this.relayUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
    console.log('[GraspApi] createRepo - httpBase:', httpBase);
    
    const webUrl = `${httpBase}/${npub}/${options.name}`; // no .git
    const cloneUrl = `${webUrl}.git`;
    console.log('[GraspApi] createRepo - webUrl:', webUrl);
    console.log('[GraspApi] createRepo - cloneUrl:', cloneUrl);
    // Gather relay aliases: base relay plus optional configured aliases and ngit-relay fallback
    const aliases: string[] = [];
    // base ws(s) relay
    aliases.push(this.relayUrl);
    // from env (comma-separated)
    try {
      // Vite style
      const viteAliases = (import.meta as any)?.env?.VITE_GRASP_RELAY_ALIASES as string | undefined;
      if (viteAliases) {
        viteAliases
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((a) => aliases.push(a));
      }
    } catch {}
    try {
      // Node style
      const nodeAliases = (globalThis as any)?.process?.env?.VITE_GRASP_RELAY_ALIASES as
        | string
        | undefined;
      if (nodeAliases) {
        nodeAliases
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((a) => aliases.push(a));
      }
    } catch {}
    // add ngit-relay:<port> alias derived from current relay
    try {
      const u = new URL(this.relayUrl);
      const port = u.port ? `:${u.port}` : '';
      const ngitAlias = `${u.protocol}//ngit-relay${port}`;
      aliases.push(ngitAlias);
    } catch {}
    // de-duplicate while preserving order
    const seen = new Set<string>();
    // Only include valid Nostr relay URLs in the relays tag to avoid adapter errors
    const relayAliases = aliases.filter((a) => {
      if (seen.has(a)) return false;
      seen.add(a);
      return this.isValidNostrRelayUrl(a);
    });

    const event: EventTemplate = {
      kind: 30617,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', options.name],
        ['name', options.name],
        ['description', options.description || ''],
        ['clone', cloneUrl, ...relayAliases],
        ['web', webUrl],
        ['relays', ...relayAliases]
      ],
      content: options.description || ''
    };

    await this.publishEvent(event);
    const result = {
      id: '', // Will be set after event is published
      name: options.name,
      fullName: `${npub}/${options.name}`,
      description: options.description || '',
      defaultBranch: 'main',
      isPrivate: options.private || false,
      cloneUrl: cloneUrl,
      htmlUrl: webUrl,
      owner: {
        login: npub,
        type: 'User' as const
      }
    };
    console.log('[GraspApi] createRepo - returning result:', result);
    return result;
  }

  async updateRepo(
    owner: string,
    repo: string,
    updates: { name?: string; description?: string; private?: boolean }
  ): Promise<RepoMetadata> {
    // Update repository announcement event
    const currentRepo = await this.getRepo(owner, repo);

    const httpBase = this.relayUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
    const npub = nip19.npubEncode(this.pubkey);
    const targetName = updates.name || repo;
    const webUrl = `${httpBase}/${npub}/${targetName}`;
    const cloneUrl = `${webUrl}.git`;
    // Reuse alias logic
    const aliasSeen = new Set<string>();
    const aliasList: string[] = [];
    aliasList.push(this.relayUrl);
    try {
      const viteAliases = (import.meta as any)?.env?.VITE_GRASP_RELAY_ALIASES as string | undefined;
      if (viteAliases)
        viteAliases
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((a) => aliasList.push(a));
    } catch {}
    try {
      const nodeAliases = (globalThis as any)?.process?.env?.VITE_GRASP_RELAY_ALIASES as
        | string
        | undefined;
      if (nodeAliases)
        nodeAliases
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((a) => aliasList.push(a));
    } catch {}
    try {
      const u = new URL(this.relayUrl);
      const port = u.port ? `:${u.port}` : '';
      aliasList.push(`${u.protocol}//ngit-relay${port}`);
    } catch {}
    const relayAliases = aliasList.filter((a) => {
      if (aliasSeen.has(a)) return false;
      aliasSeen.add(a);
      return this.isValidNostrRelayUrl(a);
    });

    const event: EventTemplate = {
      kind: 30617,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', targetName],
        ['name', updates.name || currentRepo.name],
        ['description', updates.description || currentRepo.description || ''],
        ['clone', cloneUrl, ...relayAliases],
        ['web', webUrl],
        ['relays', ...relayAliases]
      ],
      content: updates.description || currentRepo.description || ''
    };

    await this.publishEvent(event);

    return {
      ...currentRepo,
      name: updates.name || currentRepo.name,
      description: updates.description || currentRepo.description
    };
  }

  async forkRepo(owner: string, repo: string, options?: GitForkOptions): Promise<RepoMetadata> {
    // For GRASP, forking means creating a new repo announcement that references the original
    const originalRepo = await this.getRepo(owner, repo);
    const forkName = options?.name || `${repo}-fork`;

    const npub = nip19.npubEncode(this.pubkey);
    const httpBase = this.relayUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
    const webUrl = `${httpBase}/${npub}/${forkName}`;
    const cloneUrl = `${webUrl}.git`;
    const aliasDedup = new Set<string>();
    const aliasList: string[] = [this.relayUrl];
    try {
      const viteAliases = (import.meta as any)?.env?.VITE_GRASP_RELAY_ALIASES as string | undefined;
      if (viteAliases)
        viteAliases
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((a) => aliasList.push(a));
    } catch {}
    try {
      const nodeAliases = (globalThis as any)?.process?.env?.VITE_GRASP_RELAY_ALIASES as
        | string
        | undefined;
      if (nodeAliases)
        nodeAliases
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((a) => aliasList.push(a));
    } catch {}
    try {
      const u = new URL(this.relayUrl);
      const port = u.port ? `:${u.port}` : '';
      aliasList.push(`${u.protocol}//ngit-relay${port}`);
    } catch {}
    const relayAliases = aliasList.filter((a) => {
      if (aliasDedup.has(a)) return false;
      aliasDedup.add(a);
      return this.isValidNostrRelayUrl(a);
    });

    const event: EventTemplate = {
      kind: 30617,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', forkName],
        ['name', forkName],
        ['description', `Fork of ${originalRepo.fullName}`],
        ['clone', cloneUrl, ...relayAliases],
        ['web', webUrl],
        ['relays', ...relayAliases],
        ['fork', originalRepo.cloneUrl] // Reference to original
      ],
      content: `Fork of ${originalRepo.fullName}`
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
        type: 'User'
      }
    };
  }

  /**
   * Commit Operations
   */
  async listCommits(owner: string, repo: string, options?: ListCommitsOptions): Promise<Commit[]> {
    await this.ensureCapabilities();
    const npub = nip19.npubEncode(owner);
    const httpOrigin = this.httpBase || normalizeHttpOrigin(this.relayUrl);
    const remoteUrl = `${httpOrigin}/${npub}/${repo}.git`;
    try {
      // Smart HTTP fetch logic parallels ngit’s use of libgit2 fetch mechanism
      const fs = createMemFs();
      const dir = '/grasp';
      await git.fetch({
        fs,
        http,
        dir,
        url: remoteUrl,
        depth: options?.per_page ?? 20,
        singleBranch: true,
        ref: options?.sha ?? 'main'
      });
      const ref = options?.sha ?? 'main';
      // Equivalent to ngit git/mod.rs::list_commits constructing head log traversal
      const commits = await git.log({ fs, dir, ref, depth: options?.per_page ?? 20 });
      return commits.map((c) => ({
        sha: c.oid,
        url: `${remoteUrl}/commit/${c.oid}`,
        author: { name: c.commit.author.name, email: c.commit.author.email, date: new Date(c.commit.author.timestamp * 1000).toISOString() },
        committer: { name: c.commit.committer.name, email: c.commit.committer.email, date: new Date(c.commit.committer.timestamp * 1000).toISOString() },
        message: c.commit.message,
        parents: (c.commit.parent ?? []).map((p: string) => ({ sha: p, url: `${remoteUrl}/commit/${p}` })),
        htmlUrl: `${remoteUrl}/commit/${c.oid}`,
        commit: {
          message: c.commit.message,
          committer: {
            name: c.commit.committer.name,
            email: c.commit.committer.email,
            date: new Date(c.commit.committer.timestamp * 1000).toISOString()
          },
          author: {
            name: c.commit.author.name,
            email: c.commit.author.email,
            date: new Date(c.commit.author.timestamp * 1000).toISOString()
          }
        }
      }));
    } catch (err) {
      console.error('listCommits failed', err);
      return [];
    }
  }

  async getCommit(owner: string, repo: string, sha: string): Promise<Commit> {
    await this.ensureCapabilities();
    const npub = nip19.npubEncode(owner);
    const httpOrigin = this.httpBase || normalizeHttpOrigin(this.relayUrl);
    const remoteUrl = `${httpOrigin}/${npub}/${repo}.git`;
    try {
      const fs = createMemFs();
      const dir = '/grasp';
      // Mirrors ngit git/mod.rs::fetch_commit pattern using libgit2 shallow fetch
      await git.fetch({ fs, http, dir, url: remoteUrl, depth: 1 });
      const { commit } = await git.readCommit({ fs, dir, oid: sha });
      // Commit parsing consistent with ngit commit_to_event representation
      return {
        sha,
        url: `${remoteUrl}/commit/${sha}`,
        author: { name: commit.author.name, email: commit.author.email, date: new Date(commit.author.timestamp * 1000).toISOString() },
        committer: { name: commit.committer.name, email: commit.committer.email, date: new Date(commit.committer.timestamp * 1000).toISOString() },
        message: commit.message,
        parents: (commit.parent ?? []).map((p: string) => ({ sha: p, url: `${remoteUrl}/commit/${p}` })),
        htmlUrl: `${remoteUrl}/commit/${sha}`
      };
    } catch (err) {
      console.error('getCommit failed', err);
      throw new Error(`Failed to get commit: ${err}`);
    }
  }

  /**
   * Issue Operations
   */
  async listIssues(owner: string, repo: string, options?: ListIssuesOptions): Promise<Issue[]> {
    // Query for issue events (NIP-34 kind 1621)
    const repoId = `${nip19.npubEncode(owner)}:${repo}`;
    const events = await this.queryEvents([
      {
        kinds: [1621],
        '#a': [repoId],
        limit: options?.per_page || 30
      }
    ]);

    return events.map((event) => ({
      id: parseInt(event.id.slice(-8), 16), // Use last 8 chars of event ID as number
      number: parseInt(event.id.slice(-8), 16),
      title: getTagValue(event as any, 'subject') || 'Untitled',
      body: event.content,
      state: getTagValue(event as any, 'closed') ? 'closed' : 'open',
      author: {
        login: nip19.npubEncode(event.pubkey),
        avatarUrl: undefined
      },
      assignees: [],
      labels: getTags(event as any, 'label').map((t) => ({
        name: t[1],
        color: '#000000',
        description: undefined
      })),
      createdAt: new Date(event.created_at * 1000).toISOString(),
      updatedAt: new Date(event.created_at * 1000).toISOString(),
      closedAt: getTagValue(event as any, 'closed'),
      url: `nostr:${nip19.neventEncode({ id: event.id, relays: [this.relayUrl] })}`,
      htmlUrl: `${this.relayUrl}/issues/${event.id}`
    }));
  }

  async getIssue(owner: string, repo: string, issueNumber: number): Promise<Issue> {
    const issues = await this.listIssues(owner, repo);
    const issue = issues.find((i) => i.number === issueNumber);

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
        ...(issue.labels?.map((label: string) => ['label', label]) || [])
      ],
      content: issue.body || ''
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
        avatarUrl: undefined
      },
      assignees: [],
      labels:
        issue.labels?.map((label: string) => ({
          name: label,
          color: '#000000',
          description: undefined
        })) || [],
      createdAt: new Date(publishedEvent.created_at * 1000).toISOString(),
      updatedAt: new Date(publishedEvent.created_at * 1000).toISOString(),
      closedAt: undefined,
      url: `nostr:${nip19.neventEncode({ id: publishedEvent.id, relays: [this.relayUrl] })}`,
      htmlUrl: `${this.relayUrl}/issues/${publishedEvent.id}`
    };
  }

  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    updates: Partial<NewIssue>
  ): Promise<Issue> {
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
  async listPullRequests(
    owner: string,
    repo: string,
    options?: ListPullRequestsOptions
  ): Promise<PullRequest[]> {
    // Map to patch operations
    const patches = await this.listPatches(owner, repo);

    return patches.map((patch) => ({
      id: parseInt(patch.id.slice(-8), 16),
      number: parseInt(patch.id.slice(-8), 16),
      title: patch.title,
      body: patch.description,
      state: 'open', // Patches don't have explicit state
      author: patch.author,
      head: {
        ref: 'patch-branch',
        sha: patch.commits[0]?.sha || '',
        repo: { name: repo, owner: nip19.npubEncode(owner) }
      },
      base: {
        ref: 'main',
        sha: '',
        repo: { name: repo, owner: nip19.npubEncode(owner) }
      },
      mergeable: undefined,
      merged: false,
      mergedAt: undefined,
      createdAt: patch.createdAt,
      updatedAt: patch.updatedAt,
      url: `nostr:${patch.id}`,
      htmlUrl: `${this.relayUrl}/patches/${patch.id}`,
      diffUrl: `${this.relayUrl}/patches/${patch.id}.diff`,
      patchUrl: `${this.relayUrl}/patches/${patch.id}.patch`
    }));
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequest> {
    const prs = await this.listPullRequests(owner, repo);
    const pr = prs.find((p) => p.number === prNumber);

    if (!pr) {
      throw new Error(`Pull request #${prNumber} not found`);
    }

    return pr;
  }

  async createPullRequest(owner: string, repo: string, pr: NewPullRequest): Promise<PullRequest> {
    throw new Error('GRASP createPullRequest not implemented - use patch workflow instead');
  }

  async updatePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    updates: Partial<NewPullRequest>
  ): Promise<PullRequest> {
    throw new Error('GRASP updatePullRequest not implemented - use patch workflow instead');
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    options?: {
      commitTitle?: string;
      commitMessage?: string;
      mergeMethod?: 'merge' | 'squash' | 'rebase';
    }
  ): Promise<PullRequest> {
    throw new Error('GRASP mergePullRequest not implemented - use patch workflow instead');
  }

  /**
   * Patch Operations (native to GRASP/NIP-34)
   */
  async listPatches(owner: string, repo: string): Promise<Patch[]> {
    // Query for patch events (NIP-34 kind 1617)
    const repoId = `${nip19.npubEncode(owner)}:${repo}`;
    const events = await this.queryEvents([
      {
        kinds: [1617],
        '#a': [repoId],
        limit: 50
      }
    ]);

    return events.map((event) => ({
      id: event.id,
      title: getTagValue(event as any, 'subject') || 'Untitled Patch',
      description: event.content,
      author: {
        login: nip19.npubEncode(event.pubkey),
        avatarUrl: undefined
      },
      commits: [], // Would need to parse from patch content
      files: [], // Would need to parse from patch content
      createdAt: new Date(event.created_at * 1000).toISOString(),
      updatedAt: new Date(event.created_at * 1000).toISOString()
    }));
  }

  async getPatch(owner: string, repo: string, patchId: string): Promise<Patch> {
    const patches = await this.listPatches(owner, repo);
    const patch = patches.find((p) => p.id === patchId);

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
    const events = await this.queryEvents([
      {
        kinds: [0],
        authors: [this.pubkey],
        limit: 1
      }
    ]);

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
      htmlUrl: `${this.relayUrl}/users/${npub}`
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

    const events = await this.queryEvents([
      {
        kinds: [0],
        authors: [pubkey],
        limit: 1
      }
    ]);

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
      htmlUrl: `${this.relayUrl}/users/${username}`
    };
  }

  /**
   * Repository Content Operations
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<{ content: string; encoding: string; sha: string }> {
    // Would require Git Smart HTTP implementation to fetch file content
    throw new Error('GRASP getFileContent not implemented - requires Git Smart HTTP parsing');
  }

  /**
   * Branch Operations
   */
  async listBranches(
    owner: string,
    repo: string
  ): Promise<Array<{ name: string; commit: { sha: string; url: string } }>> {
    // Would require Git Smart HTTP implementation
    throw new Error('GRASP listBranches not implemented - requires Git Smart HTTP parsing');
  }

  async getBranch(
    owner: string,
    repo: string,
    branch: string
  ): Promise<{ name: string; commit: { sha: string; url: string }; protected: boolean }> {
    throw new Error('GRASP getBranch not implemented - requires Git Smart HTTP parsing');
  }

  /**
   * Tag Operations
   */
  async listTags(
    owner: string,
    repo: string
  ): Promise<Array<{ name: string; commit: { sha: string; url: string } }>> {
    throw new Error('GRASP listTags not implemented - requires Git Smart HTTP parsing');
  }

  async getTag(
    owner: string,
    repo: string,
    tag: string
  ): Promise<{
    name: string;
    commit: { sha: string; url: string };
    zipballUrl: string;
    tarballUrl: string;
  }> {
    throw new Error('GRASP getTag not implemented - requires Git Smart HTTP parsing');
  }
}
