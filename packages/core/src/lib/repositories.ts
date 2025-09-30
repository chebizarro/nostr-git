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
  name: string;
};

/**
 * Create a composite key for grouping repos.
 * Uses EUC + repo name + normalized clone URLs to distinguish:
 * - Forks: same EUC, different names/clone URLs
 * - Duplicates: same EUC, same name, same clone URLs (different maintainers)
 */
function createRepoGroupKey(
  euc: string,
  name: string,
  cloneUrls: string[]
): string {
  // Normalize clone URLs by:
  // 1. Remove .git suffix
  // 2. Remove trailing slashes
  // 3. Replace npub-specific paths with placeholder (for gitnostr.com, relay.ngit.dev, etc.)
  // 4. Lowercase and sort
  const normalizedClones = cloneUrls
    .map(url => {
      let normalized = url.trim().toLowerCase().replace(/\.git$/, '').replace(/\/$/, '');
      // Replace npub paths with generic placeholder to group by repo name only
      normalized = normalized.replace(/\/npub1[a-z0-9]+\//g, '/{npub}/');
      return normalized;
    })
    .sort()
    .join('|');
  
  // Composite key: euc:name:clones
  // This ensures forks (different names or clone URLs) get separate groups
  return `${euc}:${name}:${normalizedClones}`;
}

export function groupByEuc(events: RepoAnnouncementEvent[]): RepoGroup[] {
  const by: Record<string, RepoGroup> = {};
  
  for (const evt of events) {
    const euc = evt.tags.find((t: NostrTag) => t[0] === 'r' && t[2] === 'euc')?.[1];
    if (!euc) continue;
    
    const d = evt.tags.find((t: NostrTag) => t[0] === 'd')?.[1] || '';
    const name = evt.tags.find((t: NostrTag) => t[0] === 'name')?.[1] || d || '';
    
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
    
    // Ensure the author is considered a maintainer if not explicitly listed
    const maintainers = maint ? maint.slice(1) : [];
    if (evt.pubkey && !maintainers.includes(evt.pubkey)) maintainers.push(evt.pubkey);

    // Create composite key using EUC + name + clone URLs
    const groupKey = createRepoGroupKey(euc, name, clone);

    if (!by[groupKey]) {
      by[groupKey] = { 
        euc, 
        repos: [], 
        handles: [], 
        web: [], 
        clone: [], 
        relays: [], 
        maintainers: [], 
        name 
      };
    }
    
    const g = by[groupKey];
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
  const out = new Set<string>(group.maintainers);
  // Add authors of all repo events as implicit maintainers
  for (const evt of group.repos) {
    if (evt.pubkey) out.add(evt.pubkey);
  }
  return out;
}

export async function loadRepositories(io: IO): Promise<RepoGroup[]> {
  // TODO: define concrete filters for 30617 via app policy; injected by app
  const events = await io.fetchEvents([{ kinds: [30617] }]);
  return groupByEuc(events as RepoAnnouncementEvent[]);
}
