import { GitFetchResult, GitMergeResult, GitProvider } from './provider.js';
import { NostrClient, NostrEvent } from './nostr-client.js';
import { defaultGetPatchContent } from './git-patch-content.js';
import {
  GIT_REPO_ANNOUNCEMENT,
  GIT_REPO_STATE,
  createRepoStateEvent,
  type RepoStateEvent,
  GIT_PATCH,
  GIT_ISSUE,
  GIT_STATUS_OPEN,
  GIT_STATUS_APPLIED,
  GIT_STATUS_CLOSED,
  GIT_STATUS_DRAFT,
  createPatchEvent,
  createStatusEvent,
  getTags,
  validateRepoAnnouncementEvent,
  validateRepoStateEvent,
  validatePatchEvent,
  validateIssueEvent,
  validateStatusEvent,
} from '@nostr-git/shared-types';

/**
 * A GitProvider implementation that coordinates between an underlying git backend
 * (isomorphic-git, wasm-git, etc) and the Nostr protocol for collaboration, PRs, issues, etc.
 */
export class NostrGitProvider implements GitProvider {
  constructor(
    private git: GitProvider, // underlying git backend
    private nostr: NostrClient // nostr relay client abstraction
  ) {}

  // Simple in-memory protocol preference store (repoId -> preferred clone/push URL)
  private protocolPrefs = new Map<string, string>();
  // Pluggable lightweight storage for protocol prefs
  private prefsStore: { get: (repoId: string) => string | undefined; set: (repoId: string, url: string) => void } = {
    get: (id) => this.protocolPrefs.get(id),
    set: (id, url) => { this.protocolPrefs.set(id, url); },
  };

  // Allow host app to provide a persistent store (e.g., localStorage, file, DB)
  configureProtocolPrefsStore(store: { get: (repoId: string) => string | undefined; set: (repoId: string, url: string) => void }) {
    this.prefsStore = store;
  }

  // Collect participants from an existing collaboration thread best-effort.
  // This gathers event pubkeys and 'p' tags for a root thread under a repo address.
  private async collectParticipants(repoAddr: string, rootId?: string, timeoutMs?: number): Promise<string[]> {
    try {
      if (!repoAddr || !rootId) return [];
      const participants = new Set<string>();
      const filter: any = { '#a': [repoAddr], '#e': [rootId] };
      const subId = this.nostr.subscribe(filter, (evt: NostrEvent) => {
        if (!evt) return;
        if (evt.pubkey) participants.add(evt.pubkey);
        for (const t of evt.tags || []) {
          if (t[0] === 'p' && t[1]) participants.add(t[1]);
        }
      });
      const ms = typeof timeoutMs === 'number' ? timeoutMs : 200;
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
      this.nostr.unsubscribe(subId);
      return Array.from(participants);
    } catch {
      return [];
    }
  }

  // Feature-flagged runtime validation toggle
  private shouldValidate(): boolean {
    try {
      // Env var wins
      if (typeof process !== 'undefined' && (process as any).env && (process as any).env.NOSTR_GIT_VALIDATE_EVENTS !== undefined) {
        return (process as any).env.NOSTR_GIT_VALIDATE_EVENTS !== 'false';
      }
      // Global flag fallback (browser)
      if (typeof globalThis !== 'undefined' && (globalThis as any).NOSTR_GIT_VALIDATE_EVENTS !== undefined) {
        return (globalThis as any).NOSTR_GIT_VALIDATE_EVENTS !== false;
      }
    } catch {}
    // Default: enabled in dev, disabled in production
    try {
      return (process as any)?.env?.NODE_ENV !== 'production';
    } catch {
      return true;
    }
  }

  // --- Internal helpers & types for RepoState (aligned with @nostr-git/shared-types) ---
  // We don't hardcode event kind numbers here; callers pass them via options.
  private parseRepoStateEvent(event: NostrEvent): {
    identifier: string | null;
    state: Record<string, string>;
  } {
    let identifier: string | null = null;
    const state: Record<string, string> = {};
    for (const tag of event.tags) {
      const [k, v] = [tag[0], tag[1]] as [string, string | undefined];
      if (k === 'd' && v) {
        identifier = v;
      } else if (k === 'HEAD' || k.startsWith('refs/heads/') || k.startsWith('refs/tags/')) {
        if (typeof v === 'string') state[k] = v;
      } else if (k.endsWith('^{}') && k.startsWith('refs/tags/')) {
        // include peeled value for annotated tags as-is
        if (typeof v === 'string') state[k] = v;
      }
    }
    return { identifier, state };
  }

  private ensureHeadInState(state: Record<string, string>): Record<string, string> {
    if ('HEAD' in state) return state;
    // Auto-HEAD behavior: prefer master, then main, then first head
    const has = (name: string) => Object.prototype.hasOwnProperty.call(state, name);
    const pick = () => {
      if (has('refs/heads/master')) return 'refs/heads/master';
      if (has('refs/heads/main')) return 'refs/heads/main';
      const firstHead = Object.keys(state).find((k) => k.startsWith('refs/heads/'));
      return firstHead || null;
    };
    const target = pick();
    if (target) {
      state['HEAD'] = `ref: ${target}`;
    }
    return state;
  }

  private buildRepoStateTags(identifier: string, state: Record<string, string>): string[][] {
    const s = this.ensureHeadInState({ ...state });
    const tags: string[][] = [];
    tags.push(['d', identifier]);
    for (const [name, value] of Object.entries(s)) {
      tags.push([name, value]);
    }
    return tags;
  }

  // --- GitProvider methods ---
  TREE(options: { ref: string }) {
    return this.git.TREE(options);
  }
  async clone(options: any): Promise<any> {
    // If no URL provided, try Nostr discovery to obtain clone endpoints.
    // Expected options: { dir, fs?, url?, repoId?, allowedPubkeys?, timeoutMs? }
    if (!options?.url) {
      if (!options?.repoId) {
        throw new Error('clone: either url or repoId must be provided');
      }
      const { urls } = await this.discoverRepo(options.repoId, {
        allowedPubkeys: options?.allowedPubkeys,
        timeoutMs: options?.timeoutMs,
        stateKind: options?.stateKind,
      });
      if (!urls.length) {
        throw new Error(`clone: no clone URLs found via Nostr for repoId '${options.repoId}'`);
      }
      // Choose preferred URL if available; otherwise select by heuristic (prefer SSH)
      const pref = this.prefsStore.get(options.repoId);
      const chooseByHeuristic = (list: string[]) => {
        const ssh = list.find(u => /^git@/.test(u) || /^ssh:\/\//.test(u));
        return ssh || list[0];
      };
      const chosen = pref && urls.includes(pref) ? pref : chooseByHeuristic(urls);
      options = { ...options, url: chosen };
    }
    const res = await this.git.clone(options);
    // Store preference on success
    if (options?.repoId && options?.url) {
      this.prefsStore.set(options.repoId, options.url);
    }
    return res;
  }
  async commit(options: any): Promise<string> { return this.git.commit(options); }
  async fetch(options: any): Promise<GitFetchResult> { return this.git.fetch(options); }
  async init(options: any): Promise<any> { return this.git.init(options); }
  async log(options: any): Promise<any> { return this.git.log(options); }
  async merge(options: any): Promise<GitMergeResult> {
    const result = await this.git.merge(options);
    // Optionally emit a status event after merge if configured
    const s = options?.nostrStatus;
    if (s?.repoAddr && s?.rootId) {
      // Default kind selection: APPLIED when fast-forward or merge commit happened
      const kind = s.kind ?? (
        result.fastForward || result.mergeCommit || result.alreadyMerged ? GIT_STATUS_APPLIED : GIT_STATUS_OPEN
      );
      const content = s.content ?? 'Merge operation completed';
      const tags: any[] = [];
      // Coordinate tag for repo
      tags.push(['a', s.repoAddr]);
      if (s.appliedCommits && s.appliedCommits.length) {
        tags.push(['applied-as-commits', ...s.appliedCommits]);
      }
      if (result.oid) {
        tags.push(['merge-commit', result.oid]);
      }
      // Enrich participants from the existing thread
      try {
        const participants = await this.collectParticipants(s.repoAddr, s.rootId, s?.timeoutMs ?? options?.timeoutMs);
        for (const p of participants) tags.push(['p', p]);
      } catch {}
      if (Array.isArray(s.tags)) {
        for (const t of s.tags) tags.push(t);
      }
      const evt = createStatusEvent({
        kind,
        content,
        rootId: s.rootId,
        repoAddr: s.repoAddr,
        appliedCommits: s.appliedCommits,
        mergedCommit: result.oid,
        tags,
        created_at: s.created_at,
      });
      await this.nostr.publish(evt as unknown as NostrEvent);
      // Optional close event
      if (s.close === true) {
        const closeEvt = createStatusEvent({
          kind: GIT_STATUS_CLOSED,
          content: s.closeContent ?? 'Closed',
          rootId: s.rootId,
          repoAddr: s.repoAddr,
          tags,
          created_at: s.created_at,
        });
        await this.nostr.publish(closeEvt as unknown as NostrEvent);
      }
    }
    return result;
  }
  async pull(options: any): Promise<any> { return this.git.pull(options); }
  async push(options: any): Promise<any> {
    // Partition refspecs: PR refs vs regular refs
    const refspecs: string[] = Array.isArray(options?.refspecs)
      ? options.refspecs
      : (options?.ref ? [options.ref] : []);

    const parseSpec = (spec: string) => {
      const [src, dst] = spec.split(':');
      return { src, dst: dst || undefined };
    };

    const prSpecs: { src: string; dst?: string }[] = [];
    const normalSpecs: { src: string; dst?: string }[] = [];

    for (const spec of refspecs) {
      const parsed = parseSpec(spec);
      if (parsed.src?.startsWith('refs/heads/pr/')) prSpecs.push(parsed);
      else normalSpecs.push(parsed);
    }

    const results: { server?: any; patchEventIds?: string[]; stateEventId?: string } = {};

    // 1) Publish patch events for PR specs
    if (prSpecs.length) {
      if (!options?.repoAddr) {
        throw new Error('push: repoAddr is required to publish PR patch events');
      }
      const baseBranch: string = options?.baseBranch || 'main';
      const patchIds: string[] = [];
      // Try to discover announcement to collect recipients (owner + maintainers)
      let recipients: string[] | undefined;
      if (options?.repoId) {
        try {
          const disc = await this.discoverRepo(options.repoId, { timeoutMs: options?.timeoutMs });
          const ann = disc.event;
          if (ann) {
            const maints = ann.tags.filter(t => t[0] === 'maintainers').flatMap(t => t.slice(1));
            recipients = [ann.pubkey, ...maints].filter(Boolean) as string[];
          }
        } catch {}
      }
      for (const { src } of prSpecs) {
        let commit: string | undefined;
        let parentCommit: string | undefined;
        let committerTag: [string, string, string, string, string] | undefined;
        try {
          // Best-effort resolve src to oid
          const oid = await this.git.resolveRef?.({ ref: src });
          if (typeof oid === 'string') commit = oid;
          else if (oid?.oid) commit = oid.oid;
          // Read commit to enrich metadata
          if (commit && this.git.readCommit) {
            const rc = await this.git.readCommit({ oid: commit });
            const c = rc?.commit || rc;
            const parent = c?.parent?.[0];
            if (typeof parent === 'string') parentCommit = parent;
            const name = c?.committer?.name || c?.author?.name;
            const email = c?.committer?.email || c?.author?.email;
            // isomorphic-git returns timestamp (seconds) and timezoneOffset (minutes)
            const ts = c?.committer?.timestamp || c?.author?.timestamp;
            const tz = c?.committer?.timezoneOffset ?? c?.author?.timezoneOffset;
            if (name && email && ts != null && tz != null) {
              committerTag = ['committer', String(name), String(email), String(ts), String(tz)];
            }
          }
        } catch {}

        const title = `PR ${src.replace('refs/heads/', '')}`;
        let content: string | undefined = options?.patchContent;
        if (!content && typeof options?.getPatchContent === 'function') {
          try {
            content = await options.getPatchContent({
              src,
              commit,
              parentCommit,
              baseBranch,
              repoAddr: options.repoAddr,
              repoId: options.repoId,
              dir: options.dir,
              fs: options.fs,
            });
          } catch {}
        }
        if (!content) {
          try {
            content = await defaultGetPatchContent(this.git, {
              src,
              commit,
              parentCommit,
              baseBranch,
              repoAddr: options.repoAddr,
              repoId: options.repoId,
              dir: options.dir,
              fs: options.fs,
            });
          } catch {}
        }
        if (!content) content = title;
        const extraTags: Array<[string, ...string[]]> = [['t', `base:${baseBranch}`]];
        if (parentCommit) extraTags.push(['parent-commit', parentCommit]);
        if (committerTag) extraTags.push(committerTag);
        if (Array.isArray(recipients) && recipients.length) {
          for (const p of recipients) extraTags.push(['p', p]);
        }
        const evt = createPatchEvent({
          content,
          repoAddr: options.repoAddr,
          commit,
          recipients,
          tags: extraTags as any,
          created_at: options?.created_at,
        });
        const id = await this.nostr.publish(evt as unknown as NostrEvent);
        patchIds.push(id);
      }
      results.patchEventIds = patchIds;
    }

    // 2) Delegate normal refs to server push
    if (normalSpecs.length || !refspecs.length) {
      const delegated = { ...options };
      if (normalSpecs.length) {
        const specs = normalSpecs.map(s => (s.dst ? `${s.src}:${s.dst}` : s.src));
        delegated.refspecs = specs;
        // Clear single ref to avoid conflicts
        delete delegated.ref;
      }
      try {
        results.server = await this.git.push(delegated);
      } catch (err) {
        // Fallback: try alternate URL if discoverable
        if (delegated?.repoId) {
          try {
            const disc = await this.discoverRepo(delegated.repoId, { timeoutMs: options?.timeoutMs });
            const urls = disc.urls || [];
            const current = delegated.url;
            const alt = urls.find(u => u !== current);
            if (alt) {
              const retry = { ...delegated, url: alt };
              results.server = await this.git.push(retry);
              this.prefsStore.set(delegated.repoId, alt);
            } else {
              throw err;
            }
          } catch {
            throw err;
          }
        } else {
          throw err;
        }
      }
      // Store protocol preference if provided
      if (delegated?.repoId && delegated?.url) {
        this.prefsStore.set(delegated.repoId, delegated.url);
      }
      // Emit status after successful push if requested
      const s = options?.nostrStatus;
      if (s?.repoAddr && s?.rootId) {
        const kind = s.kind ?? GIT_STATUS_APPLIED;
        const content = s.content ?? 'Push applied';
        const tags: any[] = [];
        tags.push(['a', s.repoAddr]);
        // Enrich participants from the existing thread
        try {
          const participants = await this.collectParticipants(s.repoAddr, s.rootId, s?.timeoutMs ?? options?.timeoutMs);
          for (const p of participants) tags.push(['p', p]);
        } catch {}
        if (Array.isArray(s.tags)) {
          for (const t of s.tags) tags.push(t);
        }
        const evt = createStatusEvent({
          kind,
          content,
          rootId: s.rootId,
          repoAddr: s.repoAddr,
          appliedCommits: s.appliedCommits,
          mergedCommit: undefined,
          tags,
          created_at: s.created_at,
        });
        await this.nostr.publish(evt as unknown as NostrEvent);
        if (s.close === true) {
          const closeEvt = createStatusEvent({
            kind: GIT_STATUS_CLOSED,
            content: s.closeContent ?? 'Closed',
            rootId: s.rootId,
            repoAddr: s.repoAddr,
            tags,
            created_at: s.created_at,
          });
          await this.nostr.publish(closeEvt as unknown as NostrEvent);
        }
      }
    }

    // 3) Optionally publish repo state
    if (options?.publishRepoState && options?.repoState && options?.repoStateKind) {
      const stateEventId = await this.announceRepoState({
        identifier: options.repoId || options.identifier,
        state: options.repoState,
        kind: options.repoStateKind,
        content: options.repoStateContent || '',
        created_at: options?.created_at,
      });
      results.stateEventId = stateEventId;
    }

    return results;
  }
  async status(options: any): Promise<any> { return this.git.status(options); }
  async statusMatrix(options: any): Promise<any> { return this.git.statusMatrix(options); }

  async deleteBranch(options: any): Promise<any> { return this.git.deleteBranch(options); }
  async listBranches(options: any): Promise<any> { return this.git.listBranches(options); }
  async renameBranch(options: any): Promise<any> { return this.git.renameBranch(options); }
  async branch(options: any): Promise<any> { return this.git.branch(options); }

  async deleteTag(options: any): Promise<any> { return this.git.deleteTag(options); }
  async listTags(options: any): Promise<any> { return this.git.listTags(options); }
  async tag(options: any): Promise<any> { return this.git.tag(options); }

  async add(options: any): Promise<any> { return this.git.add(options); }
  async addNote(options: any): Promise<any> { return this.git.addNote(options); }
  async listFiles(options: any): Promise<any> { return this.git.listFiles(options); }
  async readBlob(options: any): Promise<any> { return this.git.readBlob(options); }
  async readCommit(options: any): Promise<any> { return this.git.readCommit(options); }
  async readNote(options: any): Promise<any> { return this.git.readNote(options); }
  async readObject(options: any): Promise<any> { return this.git.readObject(options); }
  async readTag(options: any): Promise<any> { return this.git.readTag(options); }
  async readTree(options: any): Promise<any> { return this.git.readTree(options); }
  async remove(options: any): Promise<any> { return this.git.remove(options); }
  async removeNote(options: any): Promise<any> { return this.git.removeNote(options); }
  async writeBlob(options: any): Promise<any> { return this.git.writeBlob(options); }
  async writeCommit(options: any): Promise<any> { return this.git.writeCommit(options); }
  async writeObject(options: any): Promise<any> { return this.git.writeObject(options); }
  async writeRef(options: any): Promise<any> { return this.git.writeRef(options); }
  async writeTag(options: any): Promise<any> { return this.git.writeTag(options); }
  async writeTree(options: any): Promise<any> { return this.git.writeTree(options); }

  async deleteRemote(options: any): Promise<any> { return this.git.deleteRemote(options); }
  async getRemoteInfo(options: any): Promise<any> { return this.git.getRemoteInfo(options); }
  async getRemoteInfo2(options: any): Promise<any> { return this.git.getRemoteInfo2(options); }
  async listRemotes(options: any): Promise<any> { return this.git.listRemotes(options); }
  async listServerRefs(options: any): Promise<any> { return this.git.listServerRefs(options); }
  async addRemote(options: any): Promise<any> { return this.git.addRemote(options); }

  // Working Directory
  async checkout(options: any): Promise<any> { return this.git.checkout(options); }

  async getConfig(options: any): Promise<any> { return this.git.getConfig(options); }
  async getConfigAll(options: any): Promise<any> { return this.git.getConfigAll(options); }
  async setConfig(options: any): Promise<any> { return this.git.setConfig(options); }

  async deleteRef(options: any): Promise<any> { return this.git.deleteRef(options); }
  async expandOid(options: any): Promise<any> { return this.git.expandOid(options); }
  async expandRef(options: any): Promise<any> { return this.git.expandRef(options); }
  async fastForward(options: any): Promise<any> { return this.git.fastForward(options); }
  async findMergeBase(options: any): Promise<any> { return this.git.findMergeBase(options); }
  async findRoot(options: any): Promise<any> { return this.git.findRoot(options); }
  async hashBlob(options: any): Promise<any> { return this.git.hashBlob(options); }
  async indexPack(options: any): Promise<any> { return this.git.indexPack(options); }
  async isDescendent(options: any): Promise<any> { return this.git.isDescendent(options); }
  async isIgnored(options: any): Promise<any> { return this.git.isIgnored(options); }
  async listNotes(options: any): Promise<any> { return this.git.listNotes(options); }
  async listRefs(options: any): Promise<any> { return this.git.listRefs(options); }
  async packObjects(options: any): Promise<any> { return this.git.packObjects(options); }
  async resetIndex(options: any): Promise<any> { return this.git.resetIndex(options); }
  async resolveRef(options: any): Promise<any> { return this.git.resolveRef(options); }
  async stash(options: any): Promise<any> { return this.git.stash(options); }
  async updateIndex(options: any): Promise<any> { return this.git.updateIndex(options); }
  async version(): Promise<any> { return this.git.version(); }
  async walk(options: any): Promise<any> { return this.git.walk(options); }

  // --- Nostr-specific extensions ---

  /**
   * Discover git repo location and state via NIP-34/NIP-89 events on Nostr.
   * @param repoId - Unique repo identifier (e.g., slug, hash, d-tag)
   * @param opts - { allowedPubkeys?: string[], timeoutMs?: number }
   * @returns { urls, branches, tags, event }
   * @throws if no repo announcement found
   */
  async discoverRepo(
    repoId: string,
    opts: { allowedPubkeys?: string[]; timeoutMs?: number; stateKind?: number }
      = {}
  ): Promise<{
    urls: string[];
    branches: { name: string; hash: string }[];
    tags: { name: string; hash: string }[];
    event?: NostrEvent;
    state?: { identifier: string; state: Record<string, string>; event?: NostrEvent };
  }> {
    const { allowedPubkeys, timeoutMs = 5000 } = opts;
    const stateKind = opts.stateKind ?? GIT_REPO_STATE;

    // 1) Try to get RepoState if kind provided (latest by created_at)
    let stateResult: { identifier: string; state: Record<string, string>; event?: NostrEvent } | undefined;
    if (stateKind !== undefined) {
      try {
        const st = await this.getRepoState(repoId, { kind: stateKind, timeoutMs });
        stateResult = st;
      } catch {}
    }

    // 2) Discover URL endpoints via NIP-34 (repo announcement)
    const announcement = await new Promise<NostrEvent | undefined>((resolve) => {
      let latest: NostrEvent | undefined;
      let latestTime = 0;
      const subId = this.nostr.subscribe(
        { kinds: [GIT_REPO_ANNOUNCEMENT], '#d': [repoId] },
        (event: NostrEvent) => {
          if (allowedPubkeys && !allowedPubkeys.includes(event.pubkey)) return;
          if (this.shouldValidate()) {
            const v = validateRepoAnnouncementEvent(event as any);
            if (!v.success) return; // ignore invalid events when validation is on
          }
          if (event.created_at > latestTime) {
            latest = event;
            latestTime = event.created_at;
          }
        }
      );
      setTimeout(() => {
        this.nostr.unsubscribe(subId);
        resolve(latest);
      }, timeoutMs);
    });

    const urls: string[] = [];
    const branches: { name: string; hash: string }[] = [];
    const tags: { name: string; hash: string }[] = [];

    if (announcement) {
      const cloneTags = getTags(announcement as any, 'clone') as [string, ...string[]][];
      for (const tag of cloneTags) {
        if (tag.length > 1) urls.push(...tag.slice(1));
      }
    }

    // Merge RepoState-derived refs if available (source of truth for refs)
    if (stateResult) {
      for (const [name, value] of Object.entries(stateResult.state)) {
        if (name.startsWith('refs/heads/') && value && !value.startsWith('ref: ')) {
          const short = name.substring('refs/heads/'.length);
          if (!branches.find((b) => b.name === short)) branches.push({ name: short, hash: value });
        }
        if (name.startsWith('refs/tags/') && value && !name.endsWith('^{}')) {
          const short = name.substring('refs/tags/'.length);
          if (!tags.find((t) => t.name === short)) tags.push({ name: short, hash: value });
        }
      }
    }

    if (!announcement && !stateResult) {
      throw new Error(`No repo discovery data found for '${repoId}'`);
    }

    return { urls, branches, tags, event: announcement, state: stateResult };
  }

  /**
   * Announce repository state (branches, tags, etc) via Nostr (NIP-34 event)
   */
  async announceRepoState(options: {
    identifier: string; // RepoRef.identifier
    state: Record<string, string>; // refs and HEAD entries as values (oid or symbolic ref)
    kind: number; // RepoState event kind (provided by caller)
    content?: string; // default ""
    created_at?: number; // optional override
  }): Promise<string> {
    const { identifier, state, kind, content = '', created_at } = options;
    // Convert internal map to RepoStateEvent using shared helper
    const refs = Object.entries(state)
      .filter(([name]) => name.startsWith('refs/'))
      .map(([name, commit]) => {
        const type = name.startsWith('refs/heads/') ? 'heads' : 'tags';
        const short = name.replace(/^refs\/heads\//, '').replace(/^refs\/tags\//, '');
        return { type: type as 'heads' | 'tags', name: short, commit, ancestry: undefined as string[] | undefined };
      });
    const headRef = state['HEAD']?.replace('ref: ', '');
    const evt = createRepoStateEvent({
      repoId: identifier,
      refs,
      head: headRef?.startsWith('refs/heads/') ? headRef.replace('refs/heads/', '') : undefined,
      created_at,
    }) as RepoStateEvent;
    // Allow overriding kind/content if needed (should match constant by default)
    (evt as any).kind = kind;
    (evt as any).content = content;
    return this.nostr.publish(evt as unknown as NostrEvent);
  }

  /**
   * Create a pull request via Nostr event (NIP-34 or custom kind)
   */
  async createPullRequest(options: any): Promise<string> {
    // Compose and publish a PR event
    throw new Error('Not implemented: createPullRequest');
  }

  /**
   * Subscribe to PRs/issues/patches for this repo via Nostr
   */
  subscribeToCollaborationEvents(repoId: string, onEvent: (event: NostrEvent) => void): string {
    // Subscribe to NIP-34 collaboration events and filter by coordinate 'a' tag for this repoId.
    // Note: address format in shared-types is `${GIT_REPO_ANNOUNCEMENT}:<pubkey>:<repoId>`.
    // Since we can't filter by wildcard pubkey, we do a coarse kind filter and post-filter by tag.
    const kinds = [
      GIT_PATCH,
      GIT_ISSUE,
      GIT_STATUS_OPEN,
      GIT_STATUS_APPLIED,
      GIT_STATUS_CLOSED,
      GIT_STATUS_DRAFT,
    ];
    const subId = this.nostr.subscribe({ kinds }, (event: NostrEvent) => {
      // Post-filter: ensure there's an 'a' tag whose value ends with `:${repoId}`
      const matchesRepo = event.tags.some((t) => t[0] === 'a' && typeof t[1] === 'string' && t[1].endsWith(`:${repoId}`));
      if (!matchesRepo) return;
      if (this.shouldValidate()) {
        let ok = false;
        switch (event.kind) {
          case GIT_PATCH: ok = validatePatchEvent(event as any).success; break;
          case GIT_ISSUE: ok = validateIssueEvent(event as any).success; break;
          case GIT_STATUS_OPEN:
          case GIT_STATUS_APPLIED:
          case GIT_STATUS_CLOSED:
          case GIT_STATUS_DRAFT:
            ok = validateStatusEvent(event as any).success; break;
          default:
            ok = false;
        }
        if (!ok) return; // drop invalid events
      }
      onEvent(event);
    });
    return subId;
  }

  /**
   * Fetch latest RepoState for identifier using a provided kind.
   * Returns the newest event by created_at and its parsed state map.
   */
  async getRepoState(
    identifier: string,
    opts: { kind: number; timeoutMs?: number; allowedPubkeys?: string[] }
  ): Promise<{ identifier: string; state: Record<string, string>; event?: NostrEvent }> {
    const { kind, timeoutMs = 4000, allowedPubkeys } = opts;
    return await new Promise((resolve, reject) => {
      let latest: NostrEvent | undefined;
      let latestTime = 0;
      const subId = this.nostr.subscribe(
        { kinds: [kind], '#d': [identifier] },
        (event: NostrEvent) => {
          if (allowedPubkeys && !allowedPubkeys.includes(event.pubkey)) return;
          if (this.shouldValidate()) {
            const v = validateRepoStateEvent(event as any);
            if (!v.success) return; // ignore invalid
          }
          if (event.created_at > latestTime) {
            latest = event;
            latestTime = event.created_at;
          }
        }
      );
      setTimeout(() => {
        this.nostr.unsubscribe(subId);
        if (!latest) return reject(new Error(`No RepoState event for '${identifier}'`));
        if (this.shouldValidate()) {
          const v = validateRepoStateEvent(latest as any);
          if (!v.success) return reject(new Error(`Invalid RepoState event for '${identifier}': ${v.error.message}`));
        }
        const parsed = this.parseRepoStateEvent(latest);
        const id = parsed.identifier ?? identifier;
        const state = this.ensureHeadInState(parsed.state);
        resolve({ identifier: id, state, event: latest });
      }, timeoutMs);
    });
  }
}
