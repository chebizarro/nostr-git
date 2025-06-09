import {
  parseRepoStateEvent,
  type Patch,
  type RepoAnnouncementEvent,
  type RepoStateEvent,
} from "@nostr-git/shared-types";
import { listBranchesFromEvent, type Branch } from "@nostr-git/core";

export class Repo {
  repoEvent: RepoAnnouncementEvent;
  repoStateEvent?: RepoStateEvent;

  selectedBranch = $state<string | undefined>(undefined);
  mainBranch = $state<string | undefined>(undefined);

  #patches = $state<Patch[] | undefined>(undefined);

  get patches() {
    return this.#patches;
  }

  set patches(value: Patch[] | undefined) {
    this.#patches = value;
  }

  branches = $derived(async () => {
    if (this.repoStateEvent) {
      const state = parseRepoStateEvent(this.repoStateEvent);
      return state.refs.map((ref) => ({
        name: ref.ref,
        commit: ref.commit,
        lineage: ref.lineage,
      }));
    } else {
      const repoBranches = await listBranchesFromEvent({ repoEvent: this.repoEvent });
      const refs = repoBranches.map((branch: Branch) => ({
        name: branch.name,
        commit: branch.oid,
        lineage: branch.isHead,
      }));
      return refs;
    }
  });

  constructor({
    repoEvent,
    repoStateEvent,
  }: {
    repoEvent: RepoAnnouncementEvent;
    repoStateEvent?: RepoStateEvent;
  }) {
    this.repoEvent = repoEvent;
    this.repoStateEvent = repoStateEvent;
  }
}
