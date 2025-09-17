// Core: repo state merge (30618) bounded by maintainers

import type { RepoStateEvent, NostrTag } from '@nostr-git/shared-types';

export type RefHeads = Record<
  string,
  { commit: string; eventId: string; created_at: number; pubkey: string }
>;

export function mergeRepoStateByMaintainers(args: {
  states: RepoStateEvent[];
  maintainers: Set<string>;
}): RefHeads {
  const out: RefHeads = {};
  for (const evt of args.states) {
    if (!args.maintainers.has(evt.pubkey)) continue;
    for (const tag of evt.tags as NostrTag[]) {
      if (tag[0].startsWith('refs/heads/') || tag[0].startsWith('refs/tags/')) {
        const ref = tag[0];
        const commit = tag[1];
        const existing = out[ref];
        if (!existing || evt.created_at > existing.created_at) {
          out[ref] = {
            commit,
            eventId: (evt as any).id,
            created_at: evt.created_at,
            pubkey: evt.pubkey
          };
        }
      }
      if (tag[0] === 'HEAD') {
        const ref = 'HEAD';
        const commit = tag[1];
        const existing = out[ref];
        if (!existing || evt.created_at > existing.created_at) {
          out[ref] = {
            commit,
            eventId: (evt as any).id,
            created_at: evt.created_at,
            pubkey: evt.pubkey
          };
        }
      }
    }
  }
  return out;
}
