import {
  IssueEvent,
  parseRepoAnnouncementEvent,
  parseRepoStateEvent,
  PatchEvent,
  RepoAnnouncement,
  RepoState,
  type RepoAnnouncementEvent,
  type RepoStateEvent,
  createRepoAnnouncementEvent,
  createRepoStateEvent,
  StatusEvent,
  CommentEvent,
  LabelEvent,
} from "@nostr-git/shared-types";
import { type MergeAnalysisResult } from "@nostr-git/core";
import { canonicalRepoKey } from "@nostr-git/core";
import { type Readable } from "svelte/store";
import { context } from "$lib/stores/context";
import { Token, tokens } from "$lib/stores/tokens";
import { WorkerManager, type WorkerProgressEvent, type CloneProgress } from "./WorkerManager";
import { CacheManager, MergeAnalysisCacheManager, CacheType } from "./CacheManager";
import { PatchManager } from "./PatchManager";
import { CommitManager } from "./CommitManager";
import { BranchManager } from "./BranchManager";
import { FileManager } from "./FileManager";
import {
  RepoCore,
  type RepoContext,
  type EffectiveLabelsV2,
} from "@nostr-git/core";



export class Repo {
  name: string = $state("");
  description: string = $state("");
  key: string = $state("");
  issues = $state<IssueEvent[]>([]);
  patches = $state<PatchEvent[]>([]);
  hashtags = $state<string[]>([]);
  tokens = $state<Token[]>([]);
  refs: Array<{ name: string; type: "heads" | "tags"; fullRef: string; commitId: string }> = $state([]);
  earliestUniqueCommit: string = $state("");
  createdAt: string = $state("");
  clone: string[] = $state([]);
  web: string[] = $state([]);
  address: string = $state("");

  repoEvent: RepoAnnouncementEvent | undefined = $state(undefined);
  #repo: RepoAnnouncement | undefined = $state(undefined);
  #repoStateEvent: RepoStateEvent | undefined = $state(undefined);
  #state: RepoState | undefined = $state(undefined);
  // Reactive selected branch so UI can respond to changes
  #selectedBranchState: string | undefined = $state(undefined);
  #refsLoading: boolean = $state(false);
  // Optional multi-state/status/comments/labels streams
  #repoStateEventsArr = $state<RepoStateEvent[] | undefined>(undefined);
  #statusEventsArr = $state<StatusEvent[] | undefined>(undefined);
  #commentEventsArr = $state<CommentEvent[] | undefined>(undefined);
  #labelEventsArr = $state<LabelEvent[] | undefined>(undefined);

  // Manager components
  workerManager!: WorkerManager;
  cacheManager!: CacheManager;
  mergeAnalysisCacheManager!: MergeAnalysisCacheManager;
  patchManager!: PatchManager;
  commitManager!: CommitManager;
  branchManager!: BranchManager;
  fileManager!: FileManager;


  // Private caches used across helpers
  #mergedRefsCache:
    | Map<string, { commitId: string; type: "heads" | "tags"; fullRef: string }>
    | undefined;
  #patchDagCache:
    | {
        key: string;
        value: {
          nodes: Map<string, any>;
          roots: string[];
          rootRevisions: string[];
          edgesCount?: number;
          topParents?: string[];
        };
      }
    | undefined;
  #statusCache: Map<
    string,
    {
      state: "open" | "draft" | "closed" | "merged" | "resolved";
      by: string;
      at: number;
      eventId: string;
    } | null
  > = new Map();
  #issueThreadCache: Map<string, { rootId: string; comments: CommentEvent[] }> = new Map();
  #labelsCache: Map<string, EffectiveLabelsV2> = new Map();

  // Cached resolved branch to avoid redundant fallback iterations
  #resolvedDefaultBranch: string | null = null;
  #branchResolutionTimestamp: number = 0;
  #branchResolutionTTL = 5 * 60 * 1000; // 5 minutes cache TTL

  #loadingIds = {
    commits: null as string | null,
    branches: null as string | null,
    clone: null as string | null,
  };

  // Clone progress state
  cloneProgress = $state<CloneProgress>({
    isCloning: false,
    phase: "",
    progress: 0,
  });

  syncStatus: any = $state(null);

  // Feature flag: controls whether background merge analysis runs automatically
  #autoMergeAnalysisEnabled: boolean = false;

  constructor({
    repoEvent,
    repoStateEvent,
    issues,
    patches,
    repoStateEvents,
    statusEvents,
    commentEvents,
    labelEvents,
  }: {
    repoEvent: Readable<RepoAnnouncementEvent>;
    repoStateEvent: Readable<RepoStateEvent>;
    issues: Readable<IssueEvent[]>;
    patches: Readable<PatchEvent[]>;
    repoStateEvents?: Readable<RepoStateEvent[]>;
    statusEvents?: Readable<StatusEvent[]>;
    commentEvents?: Readable<CommentEvent[]>;
    labelEvents?: Readable<LabelEvent[]>;
  }) {
    // Initialize WorkerManager first
    this.workerManager = new WorkerManager((progressEvent: WorkerProgressEvent) => {
      console.log(`Clone progress for ${progressEvent.repoId}: ${progressEvent.phase}`);
      this.cloneProgress = {
        isCloning: true,
        phase: progressEvent.phase,
        progress: progressEvent.progress,
      };
    });

    // Keep worker auth config synced with token store updates
    tokens.subscribe(async (t) => {
      try {
        await this.workerManager.setAuthConfig({ tokens: t });
        if (t?.length) {
          console.log("🔐 Updated git auth tokens for", t.length, "hosts");
        } else {
          console.log("🔐 Cleared git auth tokens");
        }
      } catch (e) {
        console.warn("🔐 Failed to update worker auth config from token changes:", e);
      }
    });

    // Initialize cache managers
    this.cacheManager = new CacheManager();

    // Register cache configurations for file operations
    this.cacheManager.registerCache("file_content", {
      type: CacheType.MEMORY,
      keyPrefix: "file_content_",
      defaultTTL: 10 * 60 * 1000, // 10 minutes
      maxSize: 100,
      autoCleanup: true,
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
    });

    this.cacheManager.registerCache("file_listing", {
      type: CacheType.MEMORY,
      keyPrefix: "file_listing_",
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      maxSize: 50,
      autoCleanup: true,
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
    });

    this.mergeAnalysisCacheManager = new MergeAnalysisCacheManager(this.cacheManager);

    // Initialize PatchManager with dependencies
    this.patchManager = new PatchManager(this.workerManager, this.mergeAnalysisCacheManager);

    // Initialize CommitManager with dependencies
    this.commitManager = new CommitManager(this.workerManager, this.cacheManager, {
      defaultCommitsPerPage: 30,
      enableCaching: true,
    });

    // Initialize BranchManager with dependencies
    this.branchManager = new BranchManager(this.workerManager, this.cacheManager, {
      enableCaching: true,
      autoRefresh: false,
    });

    // Initialize FileManager
    this.fileManager = new FileManager(this.workerManager, this.cacheManager, {
      enableCaching: true,
      contentCacheTTL: 10 * 60 * 1000, // 10 minutes
      listingCacheTTL: 5 * 60 * 1000, // 5 minutes
      maxCacheFileSize: 1024 * 1024, // 1MB
      autoCleanup: true,
    });

    // Store initial repo event for deferred branch loading
    let initialRepoEvent: RepoAnnouncementEvent | null = null;

    repoEvent.subscribe((event) => {
      if (event) {
        this.repoEvent = event;
        this.#repo = parseRepoAnnouncementEvent(event);
        this.name = this.#repo!.name!;
        this.description = this.#repo!.description!;
        // Compute canonical key from "pubkey:name" string (matches current @nostr-git/core signature)
        const _owner = this.getOwnerPubkey();
        this.key = canonicalRepoKey(`${_owner}:${this.#repo!.name}`);
        this.commitManager.setRepoKeys({
          canonicalKey: this.key,
          workerRepoId: this.repoEvent!.id,
        });

        // Invalidate branch cache when repo event changes
        this.invalidateBranchCache();
        // Invalidate DAG cache when repo event changes
        this.#patchDagCache = undefined;

        // Store the initial event for later processing
        if (!initialRepoEvent) {
          initialRepoEvent = event;
        }

        // Only load branches if WorkerManager is ready
        if (this.workerManager.isReady && !this.#state) {
          this.#loadBranchesFromRepo(event);
        }

        this.clone = this.#repo!.clone!;
        this.web = this.#repo!.web!;
        this.hashtags = this.#repo!.hashtags!;
        this.earliestUniqueCommit = this.#repo!.earliestUniqueCommit!;
        this.createdAt = this.#repo!.createdAt;
        this.address = this.#repo!.address;
      }
    });

    repoStateEvent.subscribe((event) => {
      if (event) {
        this.#repoStateEvent = event; // Set the reactive state
        this.#state = parseRepoStateEvent(event);

        // Process the Repository State event in BranchManager (verified against worker when possible)
        if (initialRepoEvent) {
          // Fire-and-forget; verification is async
          void this.branchManager.processRepoStateEventVerified(event, initialRepoEvent);
        } else {
          this.branchManager.processRepoStateEvent(event);
        }

        // Invalidate branch cache when repo state changes
        this.invalidateBranchCache();
        // Invalidate DAG cache when repo state changes (may affect patch interpretation)
        this.#patchDagCache = undefined;
      }
    });

    // Optional streams
    repoStateEvents?.subscribe((events) => {
      this.#repoStateEventsArr = events;
      this.#mergedRefsCache = undefined; // invalidate
    });
    statusEvents?.subscribe((events) => {
      this.#statusEventsArr = events;
      this.#statusCache.clear();
    });
    commentEvents?.subscribe((events) => {
      this.#commentEventsArr = events;
      this.#issueThreadCache.clear();
    });
    labelEvents?.subscribe((events) => {
      this.#labelEventsArr = events;
      this.#labelsCache.clear();
    });

    patches.subscribe((patchEvents) => {
      this.patches = patchEvents;
      // Only perform merge analysis if explicitly enabled and WorkerManager is ready
      if (this.#autoMergeAnalysisEnabled && this.workerManager.isReady) {
        this.#performMergeAnalysis(patchEvents);
      }
      // Invalidate DAG cache when patch set changes
      this.#patchDagCache = undefined;
    });

    tokens.subscribe(async (tokenList) => {
      this.tokens = tokenList;
      console.log("🔐 Token store updated in Repo:", tokenList.length, "tokens");

      // Update WorkerManager authentication if it's ready
      if (this.workerManager.isReady) {
        await this.workerManager.setAuthConfig({ tokens: tokenList });
        console.log("Updated WorkerManager authentication with", tokenList.length, "tokens");
      }
    });

    // Smart initialization - load refs immediately, then initialize worker in background
    (async () => {
      try {
        // Load branches/refs FIRST from state event (fast, no network needed)
        try {
          this.#refsLoading = true;
          await this.branchManager.loadAllRefs(() => this.getAllRefsWithFallback());
          this.refs = this.branchManager.getAllRefs();
          console.log(`✅ Loaded ${this.refs.length} refs immediately from state`);
        } catch (error) {
          console.error("Failed to load branches from state:", error);
          this.refs = [];
        } finally {
          this.#refsLoading = false;
        }

        // Initialize the WorkerManager (can be slow)
        await this.workerManager.initialize();

        // Wait for tokens to be loaded from localStorage before configuring auth
        if (loadedTokens.length > 0) {
          await this.workerManager.setAuthConfig({ tokens: loadedTokens });
          console.log("Configured git authentication for", loadedTokens.length, "hosts");
        } else {
          console.log("No authentication tokens found");
        }

        await this.#loadCommitsFromRepo();

        try {
          const repoId = this.key;
          const cloneUrls = [...(this.#repo?.clone || [])];
          const branch = this.branchManager.getMainBranch();
          if (repoId && cloneUrls.length > 0) {
            this.syncStatus = await this.workerManager.syncWithRemote({ repoId, cloneUrls, branch });
          }
        } catch {}

        // Load branches/refs using the new unified method
        try {
          this.#refsLoading = true;
          await this.branchManager.loadAllRefs(() => this.getAllRefsWithFallback());
          this.refs = this.branchManager.getAllRefs();
        } catch (error) {
          console.error("Failed to load branches:", error);
          this.refs = [];
        } finally {
          this.#refsLoading = false;
        }

        // Ensure background merge analysis runs once worker is ready, if enabled
        if (this.#autoMergeAnalysisEnabled && this.patches.length > 0) {
          await this.#performMergeAnalysis(this.patches);
        }
      } catch (error) {
        console.error("Git initialization failed:", error);

        if (this.#loadingIds.clone) {
          context.update(this.#loadingIds.clone, {
            type: "error",
            message: "Failed to initialize repository",
            details: error instanceof Error ? error.message : String(error),
            duration: 5000,
          });
        }
      }
    })();

    issues.subscribe((issueEvents) => {
      this.issues = issueEvents;
    });
    tokens.subscribe(async (tokens) => {
      this.tokens = tokens;

      // Update authentication configuration when tokens change
      if (this.workerManager.isReady && tokens.length > 0) {
        try {
          await this.workerManager.setAuthConfig({ tokens });
          console.log("Updated git authentication for", tokens.length, "hosts");
        } catch (error) {
          console.error("Failed to update git authentication:", error);
        }
      }
    });
  }

  /**
   * Get cached resolved default branch or perform resolution and cache the result
   * This eliminates redundant fallback iterations across multiple git operations
   */
  async getResolvedDefaultBranch(requestedBranch?: string): Promise<string> {
    const now = Date.now();

    // Check if we have a valid cached result
    if (
      this.#resolvedDefaultBranch &&
      now - this.#branchResolutionTimestamp < this.#branchResolutionTTL
    ) {
      console.log(`Using cached resolved branch: ${this.#resolvedDefaultBranch}`);
      return this.#resolvedDefaultBranch;
    }

    // Perform fresh branch resolution
    console.log("Resolving default branch (cache miss or expired)");

    // Use BranchManager's robust branch resolution
    const resolvedBranch = requestedBranch || this.branchManager.getMainBranch();

    // Cache the result
    this.#resolvedDefaultBranch = resolvedBranch;
    this.#branchResolutionTimestamp = now;

    console.log(`Cached resolved branch: ${resolvedBranch}`);
    return resolvedBranch;
  }

  /**
   * Invalidate the cached resolved branch (call when repository state changes)
   */
  invalidateBranchCache(): void {
    console.log("Invalidating branch resolution cache");
    this.#resolvedDefaultBranch = null;
    this.#branchResolutionTimestamp = 0;
  }

  private getOwnerPubkey(): string {
    const owner = this.#repo?.owner?.trim();
    if (owner && owner.length > 0) return owner;
    return (this.repoEvent?.pubkey || "").trim();
  }

  /** Build a RepoCore context snapshot from current reactive state */
  #coreCtx(): RepoContext {
    return {
      repoEvent: this.repoEvent,
      repoStateEvent: this.#repoStateEvent,
      repo: this.#repo,
      issues: this.issues,
      patches: this.patches,
      repoStateEventsArr: this.#repoStateEventsArr,
      statusEventsArr: this.#statusEventsArr,
      commentEventsArr: this.#commentEventsArr,
      labelEventsArr: this.#labelEventsArr,
    } as RepoContext;
  }

  // -------------------------
  // Trust policy
  // -------------------------
  public isAuthorized(pubkey?: string): boolean {
    if (!pubkey) return false;
    const owner = this.getOwnerPubkey();
    if (pubkey === owner) return true;
    return (this.#repo?.maintainers || []).includes(pubkey);
  }

  /** Return unique list of trusted maintainers including owner. */
  get trustedMaintainers(): string[] {
    const out = new Set<string>(this.#repo?.maintainers || []);
    const owner = this.getOwnerPubkey();
    if (owner) out.add(owner);
    return Array.from(out);
  }

  // -------------------------
  // Merged refs from 30618 by maintainers
  // -------------------------
  private mergeRepoStateByMaintainers(
    events: RepoStateEvent[]
  ): Map<string, { commitId: string; type: "heads" | "tags"; fullRef: string }> {
    return RepoCore.mergeRepoStateByMaintainers(this.#coreCtx(), events);
  }

  // -------------------------
  // Patch DAG (1617 + NIP-10)
  // -------------------------
  /** Build a patch DAG from NIP-10 relations and identify roots/revision roots. */
  public getPatchGraph(): {
    nodes: Map<string, PatchEvent>;
    roots: string[];
    rootRevisions: string[];
    edgesCount: number;
    topParents: string[];
    parentOutDegree: Record<string, number>;
    parentChildren: Record<string, string[]>;
  } {
    const ids = (this.patches || [])
      .map((p) => p.id)
      .sort()
      .join(",");
    if (this.#patchDagCache?.key === ids) return this.#patchDagCache.value as any;
    const value = RepoCore.getPatchGraph(this.#coreCtx());
    this.#patchDagCache = { key: ids, value: value as any };
    return value as any;
  }

  // -------------------------
  // Status resolution (1630–1633)
  // -------------------------
  /** Resolve final status for a root id (issue or patch). */
  public resolveStatusFor(
    rootId: string
  ): {
    state: "open" | "draft" | "closed" | "merged" | "resolved";
    by: string;
    at: number;
    eventId: string;
  } | null {
    if (!this.#statusEventsArr || this.#statusEventsArr.length === 0) return null;
    const cached = this.#statusCache.get(rootId);
    if (cached !== undefined) return cached;
    const result = RepoCore.resolveStatusFor(this.#coreCtx(), rootId);
    this.#statusCache.set(rootId, result as any);
    return result as any;
  }

  private findRootAuthor(rootId: string): string | undefined {
    const root =
      (this.issues || []).find((i) => i.id === rootId) ||
      (this.patches || []).find((p) => p.id === rootId);
    return root?.pubkey;
  }

  // -------------------------
  // Issues + NIP-22 comments
  // -------------------------
  /** Return NIP-22 scoped comments for a given root id. */
  public getIssueThread(rootId: string): { rootId: string; comments: CommentEvent[] } {
    const cached = this.#issueThreadCache.get(rootId);
    if (cached) return cached;
    const res = RepoCore.getIssueThread(this.#coreCtx(), rootId);
    this.#issueThreadCache.set(rootId, res);
    return res;
  }

  // -------------------------
  // Labels (1985 + self)
  // -------------------------
  /** Materialize effective labels for an event/address/euc target. */
  public getEffectiveLabelsFor(target: {
    id?: string;
    address?: string;
    euc?: string;
  }): EffectiveLabelsV2 {
    const key = `${target.id || ""}|${target.address || ""}|${target.euc || ""}`;
    const cached = this.#labelsCache.get(key);
    if (cached) return cached;
    const result = RepoCore.getEffectiveLabelsFor(
      this.#coreCtx(),
      target
    ) as unknown as EffectiveLabelsV2;
    this.#labelsCache.set(key, result);
    return result;
  }

  public getRepoLabels(): EffectiveLabelsV2 {
    return RepoCore.getRepoLabels(this.#coreCtx()) as unknown as EffectiveLabelsV2;
  }

  public getIssueLabels(rootId: string): EffectiveLabelsV2 {
    return RepoCore.getIssueLabels(this.#coreCtx(), rootId) as unknown as EffectiveLabelsV2;
  }
  public getPatchLabels(rootId: string): EffectiveLabelsV2 {
    return RepoCore.getPatchLabels(this.#coreCtx(), rootId) as unknown as EffectiveLabelsV2;
  }

  // -------------------------
  // Subscription hints (no network)
  // -------------------------
  public getRecommendedFilters(): any[] {
    return RepoCore.getRecommendedFilters(this.#coreCtx());
  }

  // -------------------------
  // UX helpers
  // -------------------------
  /**
   * Describe ancestry summary for a ref based on NIP-34 state if available.
   * Returns a compact count of commits ahead when ancestry/lineage is provided.
   */
  public describeAheadBehind(ref: string): { ahead: number | string[] } | null {
    // Normalize ref to fullRef if short name is passed
    const toFullRef = (s: string): string =>
      s.startsWith("refs/")
        ? s
        : s.startsWith("heads/") || s.startsWith("tags/")
          ? `refs/${s}`
          : `refs/heads/${s}`;
    const fullRef = toFullRef(ref);
    // Prefer merged refs if present
    if (this.#repoStateEventsArr && this.#repoStateEventsArr.length > 0) {
      const merged = this.mergeRepoStateByMaintainers(this.#repoStateEventsArr);
      for (const [, v] of merged.entries()) {
        if (v.fullRef === fullRef) {
          // No lineage info available in merged map; cannot compute trail
          return { ahead: 0 };
        }
      }
    }
    // Fallback to single repo state event with possible lineage
    if (this.#repoStateEvent) {
      const parsed: any = parseRepoStateEvent(this.#repoStateEvent);
      const hit = (parsed.refs || []).find(
        (r: any) => (r.ref || `refs/${r.type}/${r.name}`) === fullRef
      );
      if (hit) {
        const lineage: string[] | undefined = hit.lineage || hit.ancestry || undefined;
        if (Array.isArray(lineage) && lineage.length > 0) {
          return { ahead: lineage.length };
        }
        return { ahead: 0 };
      }
    }
    return null;
  }

  /** Return a maintainer badge for a pubkey: "owner" | "maintainer" | null. */
  public getMaintainerBadge(pubkey: string): "owner" | "maintainer" | null {
    return RepoCore.getMaintainerBadge(this.#coreCtx(), pubkey);
  }

  // Public API for getting merge analysis result (requires patch object for proper validation)
  async getMergeAnalysis(
    patch: PatchEvent,
    targetBranch?: string
  ): Promise<MergeAnalysisResult | null> {
    if (!this.repoEvent) return null;

    const repoId = this.key;
    const fallbackMain = this.branchManager.getMainBranch();
    const branch =
      (targetBranch ?? this.mainBranch ?? fallbackMain).split("/").pop() || fallbackMain;
    // Use workerRepoId (event id) for worker calls when available
    const workerRepoId = this.repoEvent?.id;
    return await this.patchManager.getMergeAnalysis(patch, branch, repoId, workerRepoId);
  }

  // Check if merge analysis is available for a patch ID
  async hasMergeAnalysis(patchId: string): Promise<boolean> {
    return await this.patchManager.hasMergeAnalysis(patchId);
  }

  // Public API for force refresh merge analysis for a patch
  async refreshMergeAnalysis(
    patch: PatchEvent,
    targetBranch?: string
  ): Promise<MergeAnalysisResult | null> {
    if (!this.repoEvent) return null;

    const repoId = this.key;
    const fallbackMain = this.branchManager.getMainBranch();
    const branch =
      (targetBranch ?? this.mainBranch ?? fallbackMain).split("/").pop() || fallbackMain;
    // Use workerRepoId (event id) for worker calls when available
    const workerRepoId = this.repoEvent?.id;
    return await this.patchManager.refreshMergeAnalysis(patch, branch, repoId, workerRepoId);
  }

  // Public API for clearing merge analysis cache
  async clearMergeAnalysisCache(): Promise<void> {
    await this.patchManager.clearCache();
  }

  /**
   * Expose a readable store of merge analyses keyed by patchId for UI subscription
   */
  getPatchAnalysisStore(): Readable<Map<string, MergeAnalysisResult>> {
    return this.patchManager.getAnalysisStore();
  }

  /**
   * Convenience accessor for a single patch's latest analysis in memory
   */
  getPatchAnalysisFor(patchId: string): MergeAnalysisResult | undefined {
    return this.patchManager.getAnalysisFor(patchId);
  }

  setCommitsPerPage(count: number) {
    // Delegate to CommitManager
    this.commitManager.setCommitsPerPage(count);
  }

  async #loadCommitsFromRepo() {
    if (!this.repoEvent) return;

    try {
      const repoId = this.key;
      const cloneUrls = [...(this.#repo?.clone || [])];

      if (!repoId || !cloneUrls.length) {
        console.warn("Repository ID or clone URLs missing, skipping initialization");
        return;
      }

      this.#loadingIds.clone = context.loading("Initializing repository...");

      // Use smart initialization instead of always cloning
      const result = await this.workerManager.smartInitializeRepo({
        repoId,
        cloneUrls,
      });

      if (result.success) {
        context.update(this.#loadingIds.clone, {
          type: "success",
          message: result.fromCache ? "Repository loaded from cache" : "Repository initialized",
          duration: 3000,
        });

        // Load commits after successful initialization
        await this.#loadCommits();
      } else {
        throw new Error(result.error || "Smart initialization failed");
      }
    } catch (error) {
      console.error("Git initialization failed:", error);

      if (this.#loadingIds.clone) {
        context.update(this.#loadingIds.clone, {
          type: "error",
          message: "Failed to initialize repository",
          details: error instanceof Error ? error.message : String(error),
          duration: 5000,
        });
      }
    }
  }

  async #loadCommits() {
    if (!this.repoEvent || !this.mainBranch) return;

    // Delegate to CommitManager
    await this.commitManager.loadCommits(
      this.key,
      undefined, // branch (will use mainBranch)
      this.mainBranch
    );
  }

  async #loadBranchesFromRepo(repoEvent: RepoAnnouncementEvent) {
    // Process repository state event for NIP-34 references if available
    if (this.#repoStateEvent) {
      // Prefer verified processing when we have the repoEvent
      await this.branchManager.processRepoStateEventVerified(this.#repoStateEvent, repoEvent);
    }

    // Delegate to BranchManager
    await this.branchManager.loadAllRefs(() => this.getAllRefsWithFallback());
  }

  get repoId() {
    return this.key;
  }

  get mainBranch() {
    return this.branchManager.getMainBranch();
  }

  get branches() {
    return this.branchManager.getBranches();
  }

  // Expose clone URLs from the parsed repo announcement
  get cloneUrls(): string[] {
    return this.#repo?.clone ?? [];
  }

  // Expose relays from the parsed repo announcement
  get relays(): string[] {
    return this.#repo?.relays ?? [];
  }

  // Expose maintainers from the parsed repo announcement
  get maintainers(): string[] {
    const owner = this.getOwnerPubkey();
    const combined = owner
      ? [...(this.#repo?.maintainers || []), owner]
      : this.#repo?.maintainers || [];
    return Array.from(new Set(combined.filter(Boolean)));
  }

  // Expose currently loaded commits for UI components
  get commits(): any[] {
    return this.commitManager.getCommits();
  }

  /**
   * Get all repository references (branches and tags) with robust fallback logic
   * This method encapsulates the sophisticated branch/ref handling logic that includes:
   * - NIP-34 reference processing
   * - Fallback to processed branches when NIP-34 refs aren't available
   * - Unified ref structure for both heads and tags
   * - Automatic branch loading with error handling
   * @returns Promise<Array<{name: string; type: "heads" | "tags"; fullRef: string; commitId: string}>>
   */
  async getAllRefsWithFallback(): Promise<
    Array<{ name: string; type: "heads" | "tags"; fullRef: string; commitId: string }>
  > {
    // Prefer merged refs by trusted maintainers when multiple 30618s are available
    if (this.#repoStateEventsArr && this.#repoStateEventsArr.length > 0) {
      if (!this.#mergedRefsCache) {
        this.#mergedRefsCache = this.mergeRepoStateByMaintainers(this.#repoStateEventsArr);
      }
      const refs: Array<{
        name: string;
        type: "heads" | "tags";
        fullRef: string;
        commitId: string;
      }> = [];
      for (const [key, ref] of this.#mergedRefsCache.entries()) {
        const name = key.split(":")[1];
        refs.push({ name, type: ref.type, fullRef: ref.fullRef, commitId: ref.commitId });
      }
      if (refs.length > 0) {
        return refs.sort((a, b) =>
          a.type === b.type ? a.name.localeCompare(b.name) : a.type === "heads" ? -1 : 1
        );
      }
    }

    // Process single repo state event if available and not already processed
    if (this.#repoStateEvent && this.#repoStateEvent.tags) {
      const hasProcessedState = this.branchManager?.getAllNIP34References().size > 0;
      if (!hasProcessedState) {
        if (this.#repo) {
          await this.branchManager.processRepoStateEventVerified(this.#repoStateEvent, this.repoEvent!);
        } else {
          this.branchManager?.processRepoStateEvent(this.#repoStateEvent);
        }
      }
    } else if (!this.#repoStateEvent) {
      // Load branches from repository if not available and we have a repo event
      if (this.branchManager && this.branchManager.getBranches().length === 0 && this.repoEvent) {
        try {
          await this.branchManager.loadAllRefs(() => this.getAllRefsWithFallback());
        } catch (error) {
          console.error("Failed to load branches from git repository:", error);
          // Continue with empty branches rather than throwing
        }
      }
    }

    // Get NIP-34 references first (preferred)
    const nip34Refs = this.branchManager?.getAllNIP34References() || new Map();
    const processedBranches = this.branchManager?.getBranches() || [];

    const refs: Array<{ name: string; type: "heads" | "tags"; fullRef: string; commitId: string }> =
      [];

    // Process NIP-34 references first
    for (const [shortName, ref] of nip34Refs) {
      refs.push({
        name: shortName,
        type: ref.type,
        fullRef: ref.fullRef,
        commitId: ref.commitId,
      });
    }

    // Fallback to processed branches if no NIP-34 refs available
    if (refs.length === 0 && processedBranches.length > 0) {
      for (const branch of processedBranches) {
        const refObj = {
          name: branch.name,
          type: "heads" as const,
          fullRef: `refs/heads/${branch.name}`,
          commitId: branch.oid || "",
        };
        refs.push(refObj);
      }
    }

    // Sort refs: heads first, then tags, alphabetically within each type
    return refs.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "heads" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Get branch names only (for backward compatibility)
   * @returns Promise<string[]>
   */
  async getBranchNames(): Promise<string[]> {
    const refs = await this.getAllRefsWithFallback();
    return refs.filter((ref) => ref.type === "heads").map((ref) => ref.name);
  }

  /**
   * Get tag names only
   * @returns Promise<string[]>
   */
  async getTagNames(): Promise<string[]> {
    const refs = await this.getAllRefsWithFallback();
    return refs.filter((ref) => ref.type === "tags").map((ref) => ref.name);
  }

  get selectedBranch() {
    // Prefer reactive state when available to trigger Svelte updates
    return this.#selectedBranchState ?? this.branchManager.getSelectedBranch();
  }

  async setSelectedBranch(branchName: string) {
    // Update in BranchManager first
    this.branchManager.setSelectedBranch(branchName);

    // Resolve short branch name (git expects short ref like "main")
    const shortBranch = (branchName || "").split("/").pop() || branchName;

    // Update reactive state for UI immediately
    this.#selectedBranchState = shortBranch;

    // Detect if the selection is a tag; skip worker branch ops in that case
    let isTag = false;
    try {
      const refs = this.branchManager.getAllRefs();
      const hit = refs.find((r) => r.name === shortBranch);
      isTag = hit?.type === "tags";
      if (isTag) {
        console.warn(`Selected ref '${shortBranch}' is a tag; skipping branch checkout.`);
      }
    } catch {}

    try {
      if (!isTag) {
        // Ensure worker is ready
        if (!this.workerManager?.isReady) {
          await this.workerManager.initialize();
        }

        // Gather clone URLs for remote operations
        const cloneUrls = [...(this.#repo?.clone || [])];

        // 1) Ask worker to sync local repo with remote for the selected branch (switch/checkout)
        if (this.key && cloneUrls.length > 0) {
          try {
            this.syncStatus = await this.workerManager.syncWithRemote({
              repoId: this.key,
              cloneUrls,
              branch: shortBranch,
            });
          } catch (syncErr) {
            console.warn("syncWithRemote failed, will try ensureFullClone:", syncErr);
          }
        }

        // 2) Ensure the branch is fully available locally (deep clone as needed)
        if (this.key) {
          await this.workerManager.ensureFullClone({ repoId: this.key, branch: shortBranch });
        }

        // 3) Clear caches impacted by branch change
        try { await this.fileManager.clearCache(this.key); } catch {}

        // Refresh commits on the newly selected branch
        // Use explicit branch to override default selection in CommitManager
        await this.commitManager.loadCommits(this.repoId, shortBranch, this.branchManager.getMainBranch());
      }

      // Invalidate cached resolved default branch so future calls re-resolve against new selection
      this.invalidateBranchCache();

      // 4) Reload refs so UI sees updated heads/tags state
      try {
        this.#refsLoading = true;
        await this.branchManager.loadAllRefs(() => this.getAllRefsWithFallback());
        this.refs = this.branchManager.getAllRefs();
      } finally {
        this.#refsLoading = false;
      }

      // 5) Verify worker status (debug visibility)
      try {
        const status = await this.workerManager.getStatus({ repoId: this.key, branch: shortBranch });
        console.log("Worker status after branch switch:", status);
      } catch {}
    } catch (e) {
      console.error("Failed to switch branch in worker or refresh commits:", e);
    }
  }

  get isLoading() {
    return (
      Object.values(this.#loadingIds).some((id) => id !== null) || this.commitManager.isLoading()
    );
  }

  get totalCommits() {
    return this.commitManager.getTotalCommits();
  }

  get currentPage() {
    return this.commitManager.getCurrentPage();
  }

  get commitsPerPage() {
    return this.commitManager.getCommitsPerPage();
  }

  // Get the current pagination state
  get pagination() {
    return this.commitManager.getPagination();
  }

  get hasMoreCommits() {
    return this.commitManager.getHasMoreCommits();
  }

  async loadMoreCommits() {
    return await this.commitManager.loadMoreCommits();
  }

  async loadPage(page: number) {
    try {
      // Use canonical repo ID consistently for worker calls
      const effectiveRepoId = this.repoId;

      // Get the actual resolved default branch with fallback
      let effectiveMainBranch: string;
      try {
        effectiveMainBranch = await this.getResolvedDefaultBranch();
      } catch (branchError) {
        console.warn("⚠️ getResolvedDefaultBranch failed, using fallback:", branchError);
        effectiveMainBranch = this.mainBranch || "";
      }

      if (!this.repoEvent || !effectiveMainBranch || !effectiveRepoId) {
        const error = "Repository event, main branch, and repository ID are required";
        return { success: false, error };
      }

      // Use the CommitManager's loadPage method which sets the page and calls loadCommits
      const originalLoadCommits = this.commitManager.loadCommits.bind(this.commitManager);

      // Temporarily override loadCommits to provide the required parameters
      this.commitManager.loadCommits = async () => {
        return await originalLoadCommits(
          effectiveRepoId!, // Use the effective repository ID
          undefined, // branch (will use mainBranch)
          effectiveMainBranch!
        );
      };

      try {
        const result = await this.commitManager.loadPage(page);
        return result;
      } finally {
        // Restore the original method
        this.commitManager.loadCommits = originalLoadCommits;
      }
    } catch (error) {
      console.error("❌ loadPage error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      } as const;
    }
  }

  async listRepoFiles({ branch, path }: { branch?: string; path?: string }) {
    const target = branch || this.branchManager.getMainBranch();
    if (!this.repoEvent) {
      return {
        files: [],
        path: path || "/",
        ref: (target || "").split("/").pop() || "",
        fromCache: false,
      } as const;
    }

    // If target name corresponds to a tag, list files by its commit
    try {
      const refs = this.branchManager.getAllRefs();
      const hit = refs.find((r) => r.name === (target || "").split("/").pop());
      if (hit && hit.type === "tags" && hit.commitId) {
        return this.fileManager.listRepoFilesAtCommit({
          repoEvent: this.repoEvent,
          repoKey: this.key,
          commit: hit.commitId,
          path: path || "/",
        });
      }
    } catch {}

    // Otherwise, treat as a branch
    return this.fileManager.listRepoFiles({
      repoEvent: this.repoEvent,
      repoKey: this.key,
      branch: target,
      path: path || "/",
    });
  }

  async getFileContent({
    path,
    branch,
    commit,
  }: {
    path: string;
    branch?: string;
    commit?: string;
  }) {
    const targetBranch = branch || this.branchManager.getMainBranch();
    if (!this.repoEvent) {
      return {
        content: "",
        path,
        ref: commit || (targetBranch || "").split("/").pop() || "",
        encoding: "utf-8",
        size: 0,
        fromCache: false,
      } as const;
    }
    return this.fileManager.getFileContent({
      repoEvent: this.repoEvent,
      repoKey: this.key,
      path,
      branch: targetBranch,
      commit,
    });
  }

  async fileExistsAtCommit({
    path,
    branch,
    commit,
  }: {
    path: string;
    branch?: string;
    commit?: string;
  }) {
    const targetBranch = branch || this.branchManager.getMainBranch();
    if (!this.repoEvent) return false;
    return this.fileManager.fileExistsAtCommit({
      repoEvent: this.repoEvent,
      repoKey: this.key,
      path,
      branch: targetBranch,
      commit,
    });
  }

  async getFileHistory({
    path,
    branch,
    maxCount,
  }: {
    path: string;
    branch?: string;
    maxCount?: number;
  }) {
    const targetBranch = branch || this.branchManager.getMainBranch();
    if (!this.repoEvent) return [];
    return this.fileManager.getFileHistory({
      repoEvent: this.repoEvent,
      repoKey: this.key,
      path,
      branch: targetBranch,
      maxCount,
    });
  }

  async getCommitHistory({ branch, depth }: { branch?: string; depth?: number }) {
    const targetBranch = branch || this.branchManager.getMainBranch();
    return await this.workerManager.getCommitHistory({
      repoId: this.key,
      branch: targetBranch,
      depth: depth ?? this.commitManager.getCommitsPerPage(),
    });
  }

  /**
   * Reset the repository state and clear all caches
   * Forces fresh data to be loaded from remote and resets local git state
   */
  async reset() {
    console.log("Resetting repository state...");

    // Reset managers that have reset methods
    this.commitManager?.reset();
    this.branchManager?.reset();

    // Clear caches for managers that have clearCache methods
    try {
      await this.fileManager?.clearCache();
      await this.patchManager?.clearCache();
      await this.mergeAnalysisCacheManager?.clear();

      // Clear individual cache types in CacheManager
      if (this.cacheManager) {
        await this.cacheManager.clear("file_content");
        await this.cacheManager.clear("file_listing");
        await this.cacheManager.clear("file_exists");
        await this.cacheManager.clear("file_history");
      }
    } catch (error) {
      console.warn("Error clearing caches during reset:", error);
    }

    // Reset branch resolution cache
    this.invalidateBranchCache();

    // Reset clone progress
    this.cloneProgress = {
      isCloning: false,
      phase: "",
      progress: 0,
    };

    // Reset local git repository to match remote HEAD state
    if (this.repoEvent) {
      try {
        console.log("Resetting local git repository to match remote...");
        const resetResult = await this.workerManager.resetRepoToRemote(
          this.key,
          this.mainBranch
        );

        if (resetResult.success) {
          console.log(`Git reset successful: ${resetResult.message}`);
        }
      } catch (resetError) {
        console.warn("Git reset to remote failed:", resetError);
        // Continue with cache clearing even if git reset fails
      }

      // Force reload branches and other data
      await this.#loadBranchesFromRepo(this.repoEvent);

      // Trigger merge analysis refresh if patches exist and auto analysis is enabled
      if (this.#autoMergeAnalysisEnabled && this.patches.length > 0) {
        await this.#performMergeAnalysis(this.patches);
      }
    }

    console.log("Repository reset complete");
  }

  /**
   * Create repository announcement event data for NIP-34
   * @param repoData Repository creation data
   * @returns Unsigned event object for external signing and publishing
   */
  createRepoAnnouncementEvent(repoData: {
    name: string;
    description?: string;
    cloneUrl?: string; // Legacy single URL support
    webUrl?: string; // Legacy single URL support
    clone?: string[]; // NIP-34 multiple clone URLs
    web?: string[]; // NIP-34 multiple web URLs
    defaultBranch?: string;
    maintainers?: string[];
    relays?: string[];
    hashtags?: string[];
    earliestUniqueCommit?: string;
  }): RepoAnnouncementEvent {
    // Use the shared-types utility function
    // Resolve a robust earliestUniqueCommit:
    // - Prefer provided value if valid 40-hex
    // - Otherwise, try to resolve from the default branch using BranchManager (nip34Ref.commitId or oid)
    const providedEuc = repoData.earliestUniqueCommit?.trim();
    const is40Hex = (v?: string) => !!v && /^[a-f0-9]{40}$/.test(v);
    const branchObj = repoData.defaultBranch
      ? this.branchManager.getBranch(repoData.defaultBranch)
      : undefined;
    const resolvedFromBranch = branchObj?.nip34Ref?.commitId || branchObj?.oid || branchObj?.commit;
    const euc = is40Hex(providedEuc)
      ? providedEuc
      : is40Hex(resolvedFromBranch)
        ? resolvedFromBranch
        : undefined;

    // Pass the canonical repo key for addressable a-tags; name is used for NIP-34 d-tag (short id)
    return createRepoAnnouncementEvent({
      repoId: canonicalRepoKey(`${this.getOwnerPubkey()}:${repoData.name}`),
      name: repoData.name,
      description: repoData.description,
      // Support both legacy single URLs and new array format
      clone: repoData.clone || (repoData.cloneUrl ? [repoData.cloneUrl] : undefined),
      web: repoData.web || (repoData.webUrl ? [repoData.webUrl] : undefined),
      relays: repoData.relays,
      maintainers: repoData.maintainers,
      hashtags: repoData.hashtags,
      earliestUniqueCommit: euc,
    });
  }

  /**
   * Create repository state event data for NIP-34
   * @param stateData Repository state data
   * @returns Unsigned event object for external signing and publishing
   */
  createRepoStateEvent(stateData: {
    repositoryId: string;
    headBranch?: string;
    branches?: string[];
    tags?: string[];
    refs?: Array<{ type: "heads" | "tags"; name: string; commit: string; ancestry?: string[] }>;
  }): RepoStateEvent {
    // Use the shared-types utility function
    return createRepoStateEvent({
      repoId: stateData.repositoryId,
      head: stateData.headBranch,
      refs: stateData.refs || [
        // Convert branches to refs format
        ...(stateData.branches?.map((branch) => ({
          type: "heads" as const,
          name: branch,
          commit: "HEAD", // This would be the actual commit hash
        })) || []),
        // Convert tags to refs format
        ...(stateData.tags?.map((tag) => ({
          type: "tags" as const,
          name: tag,
          commit: "HEAD", // This would be the actual commit hash
        })) || []),
      ],
    });
  }

  dispose() {
    this.cacheManager?.dispose();
    // MergeAnalysisCacheManager doesn't have a dispose method - it's managed by CacheManager
    this.patchManager?.dispose();
    this.commitManager?.dispose();
    this.branchManager?.dispose();
    this.fileManager?.dispose();
    this.workerManager?.dispose();
    console.log("Repo disposed");
  }

  // -------------------------
  // Thin wrappers for file edit + commit and head lookup
  // -------------------------
  async writeFileLocal({ path, content }: { path: string; content: string }): Promise<void> {
    if (!this.fileManager) throw new Error("FileManager unavailable");
    // Prefer a dedicated write API if present; otherwise, fall back to a generic method
    const anyFm: any = this.fileManager as any;
    if (typeof anyFm.writeFileLocal === "function") {
      await anyFm.writeFileLocal({ repoKey: this.key, path, content });
      return;
    }
    if (typeof anyFm.writeFile === "function") {
      await anyFm.writeFile({ repoKey: this.key, path, content });
      return;
    }
    throw new Error("writeFileLocal not implemented in FileManager");
  }

  async commit({ message }: { message: string }): Promise<{ commitId: string }> {
    if (!this.workerManager) throw new Error("WorkerManager unavailable");
    const branch = this.selectedBranch || this.mainBranch;
    const anyWm: any = this.workerManager as any;
    if (typeof anyWm.commit === "function") {
      const res = await anyWm.commit({ repoId: this.key, branch, message });
      return { commitId: res?.commitId || res?.id || "" };
    }
    throw new Error("commit not implemented in WorkerManager");
  }

  async getHeadCommitId(branchName?: string): Promise<string> {
    try {
      const short = (branchName || this.selectedBranch || this.mainBranch || "").split("/").pop() || "";
      const refs = await this.getAllRefsWithFallback();
      const hit = refs.find(r => r.type === "heads" && r.name === short);
      return hit?.commitId || "";
    } catch {
      return "";
    }
  }

  // Enable automatic background merge analysis for this Repo instance
  enableAutoMergeAnalysis(): void {
    this.#autoMergeAnalysisEnabled = true;
  }

  // Perform background merge analysis for patches
  async #performMergeAnalysis(patches: PatchEvent[]) {
    if (!patches?.length) return;

    const repoId = this.key;
    const targetBranch = this.mainBranch?.split("/").pop() || "";
    const workerRepoId = this.repoEvent?.id;

    // Delegate to PatchManager for background processing
    await this.patchManager.processInBackground(patches, targetBranch, repoId, workerRepoId);
  }
}
