// Core: repositories grouping & maintainers
// All I/O via injected closures.

import type { RepoAnnouncementEvent, NostrTag } from '@nostr-git/shared-types';

export type IO = {
  fetchEvents: (filters: any[]) => Promise<any[]>;
  publishEvent?: (evt: any) => Promise<any>;
};

export type RepoGroup = {
  euc: string; // r:euc
  repos: RepoAnnouncementEvent[];
  handles: string[]; // d values
  web: string[];
  clone: string[];
  relays: string[];
  maintainers: string[];
};

export function groupByEuc(events: RepoAnnouncementEvent[]): RepoGroup[] {
  const by: Record<string, RepoGroup> = {};
  for (const evt of events) {
    const euc = evt.tags.find((t: NostrTag) => t[0] === 'r' && t[2] === 'euc')?.[1];
    if (!euc) continue;
    const d = evt.tags.find((t: NostrTag) => t[0] === 'd')?.[1];
    const web = evt.tags
      .filter((t: NostrTag) => t[0] === 'web')
      .flatMap((t: NostrTag) => (t as string[]).slice(1));
    const clone = evt.tags
      .filter((t: NostrTag) => t[0] === 'clone')
      .flatMap((t: NostrTag) => (t as string[]).slice(1));
    const relays = evt.tags
      .filter((t: NostrTag) => t[0] === 'relays')
      .flatMap((t: NostrTag) => (t as string[]).slice(1));
    const maint = evt.tags.find((t: NostrTag) => t[0] === 'maintainers') as string[] | undefined;
    const maintainers = maint ? maint.slice(1) : [];

    if (!by[euc])
      by[euc] = { euc, repos: [], handles: [], web: [], clone: [], relays: [], maintainers: [] };
    const g = by[euc];
    g.repos.push(evt);
    if (d) g.handles.push(d);
    g.web.push(...web);
    g.clone.push(...clone);
    g.relays.push(...relays);
    g.maintainers.push(...maintainers);
  }
  return Object.values(by).map((g) => ({
    ...g,
    handles: Array.from(new Set(g.handles)),
    web: Array.from(new Set(g.web)),
    clone: Array.from(new Set(g.clone)),
    relays: Array.from(new Set(g.relays)),
    maintainers: Array.from(new Set(g.maintainers))
  }));
}

export function isMaintainer(npub: string, group: RepoGroup): boolean {
  return group.maintainers.includes(npub);
}

export function deriveMaintainers(group: RepoGroup): Set<string> {
  return new Set(group.maintainers);
}

export async function loadRepositories(io: IO): Promise<RepoGroup[]> {
  // TODO: define concrete filters for 30617 via app policy; injected by app
  const events = await io.fetchEvents([{ kinds: [30617] }]);
  return groupByEuc(events as RepoAnnouncementEvent[]);
}
