import type {
  RepoAnnouncementEvent,
  RepoStateEvent,
  ParsedRepoAnnouncementEvent,
  ParsedRepoStateEvent,
} from '@nostr-git/shared-types';
import type { GitProvider } from '@nostr-git/git-wrapper';
import { parseRepoAnnouncementEvent, parseRepoStateEvent } from '@nostr-git/shared-types';

export interface RepoHandle {
  repo: any; // Provider-specific repo handle (e.g., FS path, object, etc.)
  announcement: ParsedRepoAnnouncementEvent;
  state?: ParsedRepoStateEvent;
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
  const parsedAnnouncement = parseRepoAnnouncementEvent(announcement);
  const parsedState = state ? parseRepoStateEvent(state) : undefined;
  const url = parsedAnnouncement.clone?.[0];
  if (!url) throw new Error('No clone URL found in announcement event');
  // Default to first available provider if not supplied
  if (!provider) throw new Error('No GitProvider supplied');
  // Clone the repo (options are provider-specific)
  const repo = await provider.clone({ url });
  return {
    repo,
    announcement: parsedAnnouncement,
    state: parsedState,
  };
}
