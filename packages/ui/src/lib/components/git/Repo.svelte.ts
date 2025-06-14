import {
  IssueEvent,
  parseRepoAnnouncementEvent,
  parseRepoStateEvent,
  PatchEvent,
  RepoAnnouncement,
  RepoState,
  TrustedEvent,
  type RepoAnnouncementEvent,
  type RepoStateEvent,
} from "@nostr-git/shared-types";
import {
  listBranchesFromEvent,
  getRepoFileContentFromEvent,
  listRepoFilesFromEvent,
  type Branch
} from "@nostr-git/core";
import { get, type Readable } from "svelte/store";

export class Repo {
  repoEvent: RepoAnnouncementEvent = $state(undefined);
  repo: RepoAnnouncement | undefined = $state(undefined);
  repoStateEvent?: RepoStateEvent = $state(undefined);
  state: RepoState | undefined;
  issues = $state<IssueEvent[]>([]);
  patches = $state<PatchEvent[]>([]);

  selectedBranch = $state<string | undefined>(undefined);
  #branchesFromRepo = $state<Branch[]>([]);

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
      }));
    } else {
      // Return branches loaded from repo event
      return this.#branchesFromRepo;
    }
  });

  constructor({
    repoEvents,
    issues,
    patches,
  }: {
    repoEvents: Readable<TrustedEvent[]>;
    issues: Readable<IssueEvent[]>;
    patches: Readable<PatchEvent[]>;
  }) {
    // Subscribe to repoEvents and update reactive state
    repoEvents.subscribe((events) => {
      console.log('Repo constructor received events:', events);
      console.log('Events length:', events.length);
      console.log('Event details:', events.map(e => ({ id: e.id, kind: e.kind, pubkey: e.pubkey })));
      
      if (events && events.length > 0) {
        this.repoEvent = events.find((event: { kind: number; }) => event.kind === 30617);
        this.repoStateEvent = events.find((event: { kind: number; }) => event.kind === 30618);
        this.state = this.repoStateEvent ? parseRepoStateEvent(this.repoStateEvent) : undefined;
        this.repo = this.repoEvent ? parseRepoAnnouncementEvent(this.repoEvent) : undefined;
        console.log('Found repoEvent (30617):', !!this.repoEvent);
        console.log('Found repoStateEvent (30618):', !!this.repoStateEvent);
        console.log('Parsed state:', this.state);
        console.log('Parsed repo:', this.repo);
        
        // Load branches from repo event if no state available
        if (this.repoEvent && !this.state) {
          console.log('Loading branches from repo event (no state available)');
          this.#loadBranchesFromRepo(this.repoEvent);
        } else if (this.state) {
          console.log('Using branches from state:', this.state.refs);
        }
      }
    });

    // Subscribe to issues and update reactive state
    issues.subscribe((issueEvents) => {
      this.issues = issueEvents;
    });

    // Subscribe to patches and update reactive state
    patches.subscribe((patchEvents) => {
      this.patches = patchEvents;
    });
  }

  // Private method to load branches from repo event
  async #loadBranchesFromRepo(repoEvent: RepoAnnouncementEvent) {
    try {
      const repoBranches = await listBranchesFromEvent({ repoEvent });
      this.#branchesFromRepo = repoBranches.map((branch: Branch) => ({
        name: branch.name,
        commit: branch.oid,
        lineage: branch.isHead,
      }));
    } catch (error) {
      console.error('Failed to load branches from repo event:', error);
      this.#branchesFromRepo = [];
    }
  }

  // File handling

  async listRepoFiles({ branch }: { branch: string }) {
    const files = await listRepoFilesFromEvent({
      repoEvent: this.repoEvent!,
      branch,
    });
    return files;
  }

  async getFileContent({ branch, path }: { branch: string; path: string }) {
    const content = await getRepoFileContentFromEvent({
      repoEvent: this.repoEvent!,
      branch,
      path,
    });
    return content;
  }

}
