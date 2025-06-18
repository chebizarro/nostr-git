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
      console.log("Loading commits...")
      this.#loadCommits();
    }
    return this.#commits;
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
        const result = await this.api.clone({
          repoId,
          cloneUrls,
        });
        console.log('Clone result:', result);
        this.cloneProgress = {
          isCloning: false,
          phase: 'done',
        };
      } catch (error) {
        console.error('Git clone failed:', error);
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
      const repoBranches = await listBranchesFromEvent({ repoEvent });
      this.#branchesFromRepo = repoBranches.map((branch: Branch) => ({
        name: branch.name,
        commit: branch.oid,
        lineage: branch.isHead,
        isHead: branch.isHead,
      }));
    } catch (error) {
      this.#branchesFromRepo = [];
    }
  }

  async #loadCommits() {
    try {
        const result = await this.api.getCommitHistory({
          repoId: this.repoEvent!.id,
          branch: this.mainBranch.split("/").pop() || "main",
        });

        if (result.success) {
          this.#commits = result.commits;
        } else {
          throw new Error(result.error);
        }
    } catch (error) {
      console.error('Failed to load commits:', error);
    } finally {
      this.worker.terminate();
      console.log('Git worker terminated');
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
}
