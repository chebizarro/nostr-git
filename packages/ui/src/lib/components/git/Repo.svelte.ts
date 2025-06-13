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
  type Branch
} from "@nostr-git/core";
import { NostrEvent } from "nostr-tools";

export class Repo {
  repoEvent: RepoAnnouncementEvent = $state(undefined);
  repo: RepoAnnouncement | undefined = $state(undefined);
  repoStateEvent?: RepoStateEvent = $state(undefined);
  state: RepoState | undefined;
  issues: IssueEvent[] = $state([]);
  patches: PatchEvent[] = $state([]);

  selectedBranch = $state<string | undefined>(undefined);

  publish: (event: NostrEvent) => { controller: AbortController };

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
    } else if (this.repoEvent) {
      let _branches = $state<Branch[] | undefined>(undefined);
      async function getBranches(repoEvent: RepoAnnouncementEvent) {
        const repoBranches = await listBranchesFromEvent({ repoEvent });
        _branches = repoBranches.map((branch: Branch) => ({
          name: branch.name,
          commit: branch.oid,
          lineage: branch.isHead,
        }));
      }
      getBranches(this.repoEvent!);
      return _branches;
    }
  });

  constructor({
    repoEvent,
    repoStateEvent,
    publish,
    issues,
    patches,
  }: {
    repoEvent: RepoAnnouncementEvent | undefined;
    repoStateEvent?: RepoStateEvent | undefined;
    publish: (event: NostrEvent) => { controller: AbortController };
    issues: IssueEvent[];
    patches: PatchEvent[];
  }) {
    this.repoEvent = repoEvent;
    this.repoStateEvent = repoStateEvent;
    this.publish = publish;
    this.issues = issues;
    this.patches = patches;
    this.state = this.repoStateEvent ? parseRepoStateEvent(this.repoStateEvent) : undefined;
    this.repo = this.repoEvent ? parseRepoAnnouncementEvent(this.repoEvent) : undefined;
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
