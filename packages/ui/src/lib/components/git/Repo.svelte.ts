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

export class Repo {
  repoEvent: RepoAnnouncementEvent = $state(undefined);
  repo: RepoAnnouncement | undefined = $state(undefined);
  repoStateEvent?: RepoStateEvent = $state(undefined);
  state: RepoState | undefined = $state(undefined);
  issues = $state<IssueEvent[]>([]);
  patches = $state<PatchEvent[]>([]);
  worker: Worker;
  api: any;

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

    (async () => {
      const repoId = this.repoEvent.id;
      const cloneUrls = [...(this.repo?.clone || [])];

      try {
        // Clear any previous loading message
        if (this.#loadingIds.clone) {
          context.remove(this.#loadingIds.clone);
        }
        
        this.#loadingIds.clone = context.loading('Cloning repository...');
        
        // Clone the repository
        await this.api.clone({
          repoId,
          cloneUrls,
        });
        
        // Update loading message to success
        if (this.#loadingIds.clone) {
          context.update(this.#loadingIds.clone, {
            type: 'success',
            message: 'Repository cloned successfully',
            duration: 3000
          });
          this.#loadingIds.clone = null;
        }
      } catch (error) {
        console.error('Git clone failed:', error);
        
        if (this.#loadingIds.clone) {
          context.update(this.#loadingIds.clone, {
            type: 'error',
            message: 'Failed to clone repository',
            details: error instanceof Error ? error.message : 'Unknown error',
            duration: 5000
          });
          this.#loadingIds.clone = null;
        } else {
          context.error('Failed to clone repository', error instanceof Error ? error.message : 'Unknown error');
        }
        
        this.cloneProgress = {
          isCloning: false,
          phase: 'error',
          error: error.message,
        };
      }
    })();
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
      const skip = (this.#currentPage - 1) * this.#commitsPerPage;
      
      // Load commits with pagination
      const commitsResult = await this.api.getCommitHistory({
        repoId: this.repoEvent.id,
        branch: branchName,
        skip,
        limit: this.#commitsPerPage,
      });

      if (commitsResult.success) {
        // If it's the first page, replace the commits, otherwise append
        this.#commits = this.#currentPage === 1 
          ? commitsResult.commits 
          : [...(this.#commits || []), ...commitsResult.commits];
        
        this.#hasMoreCommits = commitsResult.hasMore;
        
        // Only fetch total count on first load
        if (this.#currentPage === 1) {
          const countResult = await this.api.getCommitCount({
            repoId: this.repoEvent.id,
            branch: branchName,
          });
          
          if (countResult.success) {
            this.#totalCommits = countResult.count;
          }
        }
        
        // Update loading message to success
        if (this.#loadingIds.commits) {
          context.update(this.#loadingIds.commits, {
            type: 'success',
            message: `Loaded ${commitsResult.commits.length} commits`,
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
