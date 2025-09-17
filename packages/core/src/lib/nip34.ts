export * from '@nostr-git/shared-types';
import { createRepoAnnouncementEvent, RepoAnnouncementEvent } from '@nostr-git/shared-types';

/**
 * Announce a repo and publish the event to relays
 *
 * This function creates a NIP-34 repository announcement event, optionally signs it,
 * and publishes it to relays. All event construction and parsing is delegated to
 * shared-types utilities, ensuring spec compliance and DRY code.
 *
 * @param opts - Repository announcement fields and publisher options
 * @returns The created (and optionally signed/published) RepoAnnouncementEvent
 *
 * @example
 * import { announceRepoAndPublish } from '@nostr-git/core';
 *
 * const event = await announceRepoAndPublish({
 *   repoId: 'my-repo',
 *   name: 'My Repo',
 *   description: 'A Nostr Git repo',
 *   pubkey: 'npub1...',
 *   relays: ['wss://relay.example.com'],
 *   hashtags: ['opensource', 'nostr'],
 *   signEvent: async (e) => signWithNostrTools(e),
 *   publishEvent: async (e) => publishToRelays(e),
 * });
 */
export type AnnounceRepoOptions = {
  repoId: string;
  name?: string;
  description?: string;
  web?: string[];
  clone?: string[];
  relays?: string[];
  earliestUniqueCommit?: string;
  maintainers?: string[];
  hashtags?: string[];
  pubkey: string;
  created_at?: number;
  signEvent?: (event: RepoAnnouncementEvent) => Promise<RepoAnnouncementEvent>;
  publishEvent?: (event: RepoAnnouncementEvent) => Promise<void>;
};

export async function announceRepoAndPublish(
  opts: AnnounceRepoOptions
): Promise<RepoAnnouncementEvent> {
  const event = createRepoAnnouncementEvent(opts);
  let signedEvent = event;
  if (opts.signEvent) {
    signedEvent = await opts.signEvent(event);
  }
  if (opts.publishEvent) {
    await opts.publishEvent(signedEvent);
  }
  return signedEvent;
}

export default {};
