import type {
  RepoAnnouncementEvent,
  RepoStateEvent,
  RepoAnnouncement,
  RepoState
} from '@nostr-git/shared-types';
import type { GitProvider } from '@nostr-git/git-wrapper';
import { parseRepoAnnouncementEvent, parseRepoStateEvent } from '@nostr-git/shared-types';
import { getGitProvider } from './git-provider.js';
import { Branch, listBranches } from './branches.js';
import { rootDir } from './git.js';
import { assertRepoAnnouncementEvent, assertRepoStateEvent } from './validation.js';

export interface RepoHandle {
  repo: any; // Provider-specific repo handle (e.g., FS path, object, etc.)
  announcement: RepoAnnouncement;
  state?: RepoState;
}

/**
 * Fetch a git repo using Nip-34 events and a GitProvider.
 * - Parses the announcement and state events
 * - Clones the repo using the first available clone URL
 * - Optionally checks out the correct branch/commit
 */
export async function fetchRepo(
  announcement: RepoAnnouncementEvent,
  state?: RepoStateEvent,
  provider?: GitProvider
): Promise<RepoHandle> {
  assertRepoAnnouncementEvent(announcement);
  if (state) assertRepoStateEvent(state);
  const parsedAnnouncement = parseRepoAnnouncementEvent(announcement);
  const parsedState = state ? parseRepoStateEvent(state) : undefined;
  const url = parsedAnnouncement.clone?.[0];
  if (!url) throw new Error('No clone URL found in announcement event');
  if (!provider) throw new Error('No GitProvider supplied');
  const repo = await provider.clone({ url });
  return {
    repo,
    announcement: parsedAnnouncement,
    state: parsedState
  };
}

export class GitRepository {
  announcement: RepoAnnouncement;
  state?: RepoState;
  dir: string;
  constructor(announcement: RepoAnnouncementEvent, state?: RepoStateEvent) {
    assertRepoAnnouncementEvent(announcement);
    if (state) assertRepoStateEvent(state);
    this.announcement = parseRepoAnnouncementEvent(announcement);
    this.state = state ? parseRepoStateEvent(state) : undefined;
    this.dir = `${rootDir}/${this.announcement.owner}/${this.announcement.repoId}`;
  }

  async getBranches(): Promise<Branch[]> {
    if (this.state)
      return this.state.refs.map((b) => ({
        name: b.ref,
        oid: b.commit,
        isHead: b.ref === this.state?.head
      }));

    const url = this.announcement.clone?.find((u) => u.startsWith('https://'));
    if (!url) throw new Error('No clone URL found in announcement event');

    return await listBranches({ url, dir: this.dir });
  }

  async clone() {
    const url = this.announcement.clone?.[0];
    if (!url) throw new Error('No clone URL found in announcement event');
    const git = getGitProvider();
    const repo = await git.clone({
      dir: this.dir,
      corsProxy: 'https://cors.isomorphic-git.org',
      url,
      ref: this.state?.head,
      singleBranch: true,
      depth: 1,
      noCheckout: true
    });
    return {
      repo,
      announcement: this.announcement,
      state: this.state
    };
  }
}
