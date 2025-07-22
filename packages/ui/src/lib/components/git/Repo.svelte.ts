import {
  IssueEvent,
  parseRepoAnnouncementEvent,
  parseRepoStateEvent,
  PatchEvent,
  RepoAnnouncement,
  RepoState,
  type RepoAnnouncementEvent,
  type RepoStateEvent,
} from "@nostr-git/shared-types";
import {
  listBranchesFromEvent,
  getRepoFileContentFromEvent,
  listRepoFilesFromEvent,
  type Branch,
  getGitWorker,
  fileExistsAtCommit,
  getCommitInfo,
  getFileHistory,
  getCommitHistory,
} from "@nostr-git/core";
import { type Readable } from "svelte/store";
import { context } from "$lib/stores/context";
import { Token, tokens } from "$lib/stores/tokens";

export class Repo {
  repoEvent: RepoAnnouncementEvent = $state(undefined);
  repo: RepoAnnouncement | undefined = $state(undefined);
  repoStateEvent?: RepoStateEvent = $state(undefined);
  state: RepoState | undefined = $state(undefined);
  issues = $state<IssueEvent[]>([]);
  patches = $state<PatchEvent[]>([]);
  worker: Worker;
  api: any;

  tokens = $state<Token[]>([]);

  selectedBranch = $state<string | undefined>(undefined);
  #branchesFromRepo = $state<Branch[]>([]);
  #commits = $state<any[] | undefined>(undefined);
  #totalCommits = $state<number | undefined>(undefined);
  #currentPage = $state<number>(1);
  #commitsPerPage = 30;
  #hasMoreCommits = $state<boolean>(false);
  #loadingIds = {
    commits: null as string | null,
    branches: null as string | null,
    clone: null as string | null
  };
  
  // Set the number of commits to load per page
  setCommitsPerPage(count: number) {
    if (count > 0 && count <= 100) { // Enforce reasonable limits
      this.#commitsPerPage = count;
      // Reset pagination when page size changes
      this.#currentPage = 1;
      this.#commits = undefined;
      this.#totalCommits = undefined;
      this.#hasMoreCommits = false;
    }
  }

  #mainBranch = $derived.by(() => {
    if (this.state) {
      return this.state.head
    } else if (this.branches) {
      return this.branches?.length > 0 ? this.branches[0].name : undefined
    }
  })

  get repoId() {
    return this.repo?.repoId;
  }

  get mainBranch() {
    return this.#mainBranch;
  }

  get branches() {
    return this.#branches;
  }

  get maintainers() {
    return this.#maintainers;
  }

  get relays() {
    return this.repo?.relays;
  }

  get commits() {
    if (!this.#commits) {
      this.#loadCommits();
    }
    return this.#commits || [];
  }

  get isLoading() {
    return Object.values(this.#loadingIds).some(id => id !== null);
  }

  get totalCommits() {
    return this.#totalCommits;
  }

  get currentPage() {
    return this.#currentPage;
  }

  get commitsPerPage() {
    return this.#commitsPerPage;
  }

  // Get the current pagination state
  get pagination() {
    return {
      page: this.#currentPage,
      pageSize: this.#commitsPerPage,
      total: this.#totalCommits,
      hasMore: this.#hasMoreCommits,
      loading: this.isLoading
    };
  }

  get hasMoreCommits() {
    return this.#hasMoreCommits;
  }

  async loadMoreCommits() {
    if (this.#hasMoreCommits && !this.isLoading) {
      this.#currentPage++;
      await this.#loadCommits();
    }
  }

  async loadPage(page: number) {
    this.#currentPage = page;
    await this.#loadCommits();
  }

  #maintainers = $derived.by(() => {
    if (this.repo) {
      return this.repo.maintainers;
    }
  });

  #branches = $derived.by(() => {
    if (this.state) {
      return this.state.refs.map((ref) => ({
        name: ref.ref,
        commit: ref.commit,
        lineage: ref.lineage,
        isHead: ref.lineage?.includes(this.state.head) || false,
      }));
    } else {
      return this.#branchesFromRepo;
    }
  });

  // Reactive state for clone progress
  cloneProgress = $state<{
    isCloning: boolean;
    phase: string;
    progress?: number;
    error?: string;
  }>({
    isCloning: false,
    phase: 'idle',
  });

  constructor({
    repoEvent,
    repoStateEvent,
    issues,
    patches,
  }: {
    repoEvent: Readable<RepoAnnouncementEvent>;
    repoStateEvent: Readable<RepoStateEvent>;
    issues: Readable<IssueEvent[]>;
    patches: Readable<PatchEvent[]>;
  }) {
    repoEvent.subscribe((event) => {
      if (event) {
        this.repoEvent = event;
        this.repo = parseRepoAnnouncementEvent(event);

        if (!this.state) {
          this.#loadBranchesFromRepo(event);
        }
      }
    });

    repoStateEvent.subscribe((event) => {
      if (event) {
        this.state = parseRepoStateEvent(event);
      }
    });

    issues.subscribe((issueEvents) => {
      this.issues = issueEvents;
    });
    
    patches.subscribe((patchEvents) => {
      this.patches = patchEvents;
    });

    const { api, worker } = getGitWorker((progressEvent) => {
      console.log(`Clone progress for ${progressEvent.repoId}: ${progressEvent.phase}`);
      this.cloneProgress = {
        isCloning: true,
        phase: progressEvent.phase,
        progress: progressEvent.progress,
      };
    });
    this.worker = worker;
    this.api = api;

    // Smart initialization - only clone if needed
    (async () => {
      const repoId = this.repoEvent.id;
      const cloneUrls = [...(this.repo?.clone || [])];

      if (!repoId || !cloneUrls.length) {
        console.warn('Missing repoId or clone URLs, skipping initialization');
        return;
      }

      try {
        // Clear any previous loading message
        if (this.#loadingIds.clone) {
          context.remove(this.#loadingIds.clone);
        }
        
        this.#loadingIds.clone = context.loading('Initializing repository...');
        
        // Use smart initialization instead of always cloning
        const result = await this.api.smartInitializeRepo({
          repoId,
          cloneUrls,
        });
        
        if (result.success) {
          // Update loading message based on whether we used cache or not
          const message = result.fromCache 
            ? 'Repository loaded from cache' 
            : 'Repository initialized successfully';
          
          if (this.#loadingIds.clone) {
            context.update(this.#loadingIds.clone, {
              type: 'success',
              message,
              duration: result.fromCache ? 2000 : 3000
            });
            this.#loadingIds.clone = null;
          }

          // Update clone progress to indicate completion
          this.cloneProgress = {
            isCloning: false,
            phase: result.fromCache ? 'cached' : 'ready',
          };
        } else {
          throw new Error(result.error || 'Smart initialization failed');
        }
      } catch (error) {
        console.error('Git initialization failed:', error);
        
        if (this.#loadingIds.clone) {
          context.update(this.#loadingIds.clone, {
            type: 'error',
            message: 'Failed to initialize repository',
            details: error instanceof Error ? error.message : 'Unknown error',
            duration: 5000
          });
          this.#loadingIds.clone = null;
        } else {
          context.error('Failed to initialize repository', error instanceof Error ? error.message : 'Unknown error');
        }
        
        this.cloneProgress = {
          isCloning: false,
          phase: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    })();

    tokens.subscribe((tokens) => {
      this.tokens = tokens;
    });
  }

  async #loadBranchesFromRepo(repoEvent: RepoAnnouncementEvent) {
    try {
      // Clear any previous loading message
      if (this.#loadingIds.branches) {
        context.remove(this.#loadingIds.branches);
      }
      
      this.#loadingIds.branches = context.loading('Loading branches...');
      
      const repoBranches = await listBranchesFromEvent({ repoEvent });
      this.#branchesFromRepo = repoBranches.map((branch: Branch) => ({
        name: branch.name,
        commit: branch.oid,
        lineage: branch.isHead,
        isHead: branch.isHead,
      }));
      
      // Update loading message to success
      if (this.#loadingIds.branches) {
        context.update(this.#loadingIds.branches, {
          type: 'success',
          message: `Loaded ${this.#branchesFromRepo.length} branches`,
          duration: 2000
        });
        this.#loadingIds.branches = null;
      }
    } catch (error) {
      console.error('Error loading branches:', error);
      
      if (this.#loadingIds.branches) {
        context.update(this.#loadingIds.branches, {
          type: 'error',
          message: 'Failed to load branches',
          details: error instanceof Error ? error.message : 'Unknown error',
          duration: 5000
        });
        this.#loadingIds.branches = null;
      } else {
        context.error('Failed to load branches', error instanceof Error ? error.message : 'Unknown error');
      }
      
      this.#branchesFromRepo = [];
    }
  }

  async #loadCommits() {
    if (!this.repoEvent || !this.mainBranch) return;
    
    try {
      // Clear any previous error
      if (this.#loadingIds.commits) {
        context.remove(this.#loadingIds.commits);
      }
      
      this.#loadingIds.commits = context.loading('Loading commits...');
      
      const branchName = this.mainBranch.split("/").pop() || "main";
      const repoId = this.repoEvent.id;
      
      // Calculate the depth needed for current page
      const requiredDepth = this.#commitsPerPage * this.#currentPage;
      
      // Check current data level
      const dataLevel = await this.api.getRepoDataLevel(repoId);
      
      // For commit history, we need full clone to avoid NotFoundError
      // Don't rely on shallow clones for commit operations
      if (dataLevel !== 'full') {
        console.log(`Upgrading to full clone for commit history (current: ${dataLevel})`);
        const upgradeResult = await this.api.ensureFullClone({
          repoId,
          branch: branchName,
          depth: Math.max(requiredDepth, 100), // Ensure sufficient depth
        });
        
        if (!upgradeResult.success) {
          throw new Error(`Failed to upgrade to full clone: ${upgradeResult.error}`);
        }
      }
      
      // Load commits with the worker's optimized method
      const commitsResult = await this.api.getCommitHistory({
        repoId,
        branch: branchName,
        depth: requiredDepth,
      });

      if (commitsResult.success) {
        const allCommits = commitsResult.commits || [];
        const startIndex = (this.#currentPage - 1) * this.#commitsPerPage;
        const endIndex = startIndex + this.#commitsPerPage;
        
        // Extract commits for current page
        const pageCommits = allCommits.slice(startIndex, endIndex);
        
        // If it's the first page, replace the commits, otherwise append
        this.#commits = this.#currentPage === 1 
          ? pageCommits 
          : [...(this.#commits || []), ...pageCommits];
        
        this.#hasMoreCommits = endIndex < allCommits.length;
        
        // Only fetch total count on first load and cache it
        if (this.#currentPage === 1 && this.#totalCommits === undefined) {
          // Use the commit count from the result if available, otherwise get it separately
          if (allCommits.length < requiredDepth) {
            // If we got fewer commits than requested, we have all of them
            this.#totalCommits = allCommits.length;
          } else {
            // Get total count separately (this might be cached)
            const countResult = await this.api.getCommitCount({
              repoId,
              branch: branchName,
            });
            
            if (countResult.success) {
              this.#totalCommits = countResult.count;
            }
          }
        }
        
        // Update loading message to success
        if (this.#loadingIds.commits) {
          const message = this.#currentPage === 1 
            ? `Loaded ${pageCommits.length} commits` 
            : `Loaded ${pageCommits.length} more commits`;
          
          context.update(this.#loadingIds.commits, {
            type: 'success',
            message,
            duration: 2000
          });
          this.#loadingIds.commits = null;
        }
      } else {
        throw new Error(commitsResult.error);
      }
    } catch (error) {
      console.error('Failed to load commits:', error);
      
      if (this.#loadingIds.commits) {
        context.update(this.#loadingIds.commits, {
          type: 'error',
          message: 'Failed to load commits',
          details: error instanceof Error ? error.message : 'Unknown error',
          duration: 5000
        });
        this.#loadingIds.commits = null;
      } else {
        context.error('Failed to load commits', error instanceof Error ? error.message : 'Unknown error');
      }
      
      this.#commits = [];
      this.#hasMoreCommits = false;
    }
  }

  async listRepoFiles({ branch, path }: { branch: string; path?: string }) {
    const files = await listRepoFilesFromEvent({
      repoEvent: this.repoEvent!,
      branch,
      path,
    });
    return files;
  }

  async getFileContent({ branch, path, commit }: { branch?: string; path: string; commit?: string }) {
    const content = await getRepoFileContentFromEvent({
      repoEvent: this.repoEvent!,
      branch: branch || this.mainBranch.split("/").pop()!,
      commit,
      path,
    });
    return content;
  }

  /**
   * Completely reset the git repo: delete from FS, reload, and re-initialize all state.
   * Shows loading/error/success in context store. Triggers a full reload of branches, commits, etc.
   */
  async resetRepo() {
    const repoId = this.repoEvent?.id;
    if (!repoId) {
      context.error('Cannot reset: repoId missing');
      return;
    }
    // Show loading
    const loadingId = context.loading('Resetting repository...');
    try {
      // Call worker to delete repo (this now also clears cache)
      const result = await this.api.deleteRepo({ repoId });
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete repo');
      }
      // Re-parse event and trigger fresh initialization
      if (this.repoEvent) {
        this.repo = parseRepoAnnouncementEvent(this.repoEvent);
        // Force re-initialization (bypasses cache)
        const cloneUrls = [...(this.repo?.clone || [])];
        this.#loadingIds.clone = context.loading('Re-initializing repository...');
        
        const initResult = await this.api.smartInitializeRepo({ 
          repoId, 
          cloneUrls,
          forceUpdate: true // Force fresh initialization
        });
        
        if (initResult.success) {
          context.update(loadingId, {
            type: 'success',
            message: 'Repository reset and reloaded',
            duration: 3000
          });
        } else {
          throw new Error(initResult.error || 'Failed to re-initialize');
        }
        
        this.#loadingIds.clone = null;
        // Reset state and reload
        this.#commits = undefined;
        this.#totalCommits = undefined;
        this.#currentPage = 1;
        this.#hasMoreCommits = false;
        
        // Reload branches and commits
        await this.#loadBranchesFromRepo(this.repoEvent);
        await this.#loadCommits();
      } else {
        context.update(loadingId, {
          type: 'warning',
          message: 'Repository reset, but announcement event missing',
          duration: 4000
        });
      }
    } catch (error) {
      context.update(loadingId, {
        type: 'error',
        message: 'Failed to reset repository',
        details: error instanceof Error ? error.message : String(error),
        duration: 5000
      });
      // Do not throw further; UI should recover gracefully
    }
  }

  async fileExistsAtCommit({ branch, path, commit }: { branch?: string; path: string; commit?: string }) {
    return await fileExistsAtCommit({
      repoEvent: this.repoEvent!,
      branch: branch || this.mainBranch.split("/").pop()!,
      commit,
      path,
    });
  }

  async getCommitInfo({ commit }: { commit: string }) {
    return await getCommitInfo({
      repoEvent: this.repoEvent!,
      commit,
    });
  }

  async getFileHistory({ path, branch, maxCount }: { path: string; branch?: string; maxCount?: number }) {
    return await getFileHistory({
      repoEvent: this.repoEvent!,
      path,
      branch: branch || this.mainBranch.split("/").pop()!,
      maxCount,
    });
  }

  async getCommitHistory({ branch, depth }: { branch?: string; depth?: number }) {
    return await getCommitHistory({
      repoEvent: this.repoEvent!,
      branch: branch || this.mainBranch.split("/").pop()!,
      depth,
    });
  }

  dispose() {
    this.worker.terminate();
  }

}
