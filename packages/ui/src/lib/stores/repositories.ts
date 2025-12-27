import { writable } from "svelte/store";

export type BookmarkedRepo = {
  address: string;
  event: any;
  relayHint: string;
};

// Singleton store for bookmarked repositories
function createBookmarksStore() {
  const subscribers = new Set<(v: BookmarkedRepo[]) => void>();
  let value: BookmarkedRepo[] = [];

  function notify() {
    for (const run of subscribers) run(value);
  }

  function subscribe(run: (v: BookmarkedRepo[]) => void) {
    run(value);
    subscribers.add(run);
    return () => subscribers.delete(run);
  }

  function set(next: BookmarkedRepo[]) {
    value = Array.isArray(next) ? next : [];
    notify();
  }

  function update(fn: (v: BookmarkedRepo[]) => BookmarkedRepo[]) {
    value = fn(value);
    notify();
  }

  return {
    subscribe,
    set,
    update,
    add: (repo: BookmarkedRepo) =>
      update((repos) => (repos.some((r) => r.address === repo.address) ? repos : [...repos, repo])),
    remove: (address: string) => update((repos) => repos.filter((r) => r.address !== address)),
    clear: () => set([]),
  };
}

// Export singleton instance
export const bookmarksStore = createBookmarksStore();

export type RepoCard = {
  euc: string;
  web: string[];
  clone: string[];
  maintainers: string[];
  refs: any;
  rootsCount: number;
  revisionsCount: number;
  title: string;
  description: string;
  first: any;
  principal: string;
  repoNaddr: string;
};

export type LoadedBookmarkedRepo = {
  address: string;
  event: any;
  relayHint: string;
};

export type ComputeCardsOptions = {
  deriveMaintainersForEuc: (euc: string) => { get: () => Set<string> | null };
  deriveRepoRefState: (euc: string) => { get: () => any };
  derivePatchGraph: (address: string) => { get: () => any };
  parseRepoAnnouncementEvent: (event: any) => any;
  Router: any;
  nip19: any;
  Address: any;
};

// Minimal singleton repositories store that holds RepoCard[]
function createRepositoriesStore() {
  const subscribers = new Set<(v: RepoCard[]) => void>();
  let value: RepoCard[] = [];

  // Caches for derived stores (same as in the page component)
  const refStateStoreByEuc = new Map<string, any>();
  const maintainersStoreByEuc = new Map<string, any>();
  const patchDagStoreByAddr = new Map<string, any>();

  function notify() {
    for (const run of subscribers) run(value);
  }

  function subscribe(run: (v: RepoCard[]) => void) {
    run(value);
    subscribers.add(run);
    return () => subscribers.delete(run);
  }

  function set(next: RepoCard[]) {
    value = Array.isArray(next) ? next : [];
    notify();
  }

  function update(fn: (v: RepoCard[]) => RepoCard[]) {
    value = fn(value);
    notify();
  }

  // Helper to create composite key for proper fork/duplicate distinction
  function createRepoKey(event: any): string {
    const euc = (event.tags || []).find((t: string[]) => t[0] === "r" && t[2] === "euc")?.[1] || "";
    const d = (event.tags || []).find((t: string[]) => t[0] === "d")?.[1] || "";
    const name = (event.tags || []).find((t: string[]) => t[0] === "name")?.[1] || d || "";

    // Normalize clone URLs by:
    // 1. Remove .git suffix
    // 2. Remove trailing slashes
    // 3. Replace npub-specific paths with placeholder (for gitnostr.com, relay.ngit.dev, etc.)
    // 4. Lowercase and sort
    const cloneUrls = (event.tags || [])
      .filter((t: string[]) => t[0] === "clone")
      .flatMap((t: string[]) => t.slice(1))
      .map((url: string) => {
        let normalized = url
          .trim()
          .toLowerCase()
          .replace(/\.git$/, "")
          .replace(/\/$/, "");
        // Replace npub paths with generic placeholder to group by repo name only
        normalized = normalized.replace(/\/npub1[a-z0-9]+\//g, "/{npub}/");
        return normalized;
      })
      .sort()
      .join("|");
    return `${euc}:${name}:${cloneUrls}`;
  }

  function computeCards(
    loadedBookmarkedRepos: LoadedBookmarkedRepo[],
    options: ComputeCardsOptions
  ): RepoCard[] {
    const {
      deriveMaintainersForEuc,
      deriveRepoRefState,
      derivePatchGraph,
      parseRepoAnnouncementEvent,
      Router,
      nip19,
      Address,
    } = options;

    // Validate that a string is a valid hex pubkey (exactly 64 hex characters)
    const isValidPubkey = (pubkey: string | undefined | null): boolean => {
      if (!pubkey || typeof pubkey !== 'string') return false;
      return /^[0-9a-f]{64}$/i.test(pubkey);
    };

    const bookmarked = loadedBookmarkedRepos || [];
    const byCompositeKey = new Map<string, RepoCard>();

    for (const { event, relayHint } of bookmarked) {
      // Try to find EUC tag, fall back to any r tag, or use event ID as last resort
      const eucTag = (event.tags || []).find((t: string[]) => t[0] === "r" && t[2] === "euc");
      const anyRTag = (event.tags || []).find((t: string[]) => t[0] === "r");
      const euc = eucTag?.[1] || anyRTag?.[1] || event.id || "";

      if (!euc) {
        continue;
      }

      // Use composite key to distinguish forks from duplicates
      const compositeKey = createRepoKey(event);
      const d = (event.tags || []).find((t: string[]) => t[0] === "d")?.[1] || "";
      const name = (event.tags || []).find((t: string[]) => t[0] === "name")?.[1] || "";
      const cloneUrls = (event.tags || []).filter((t: string[]) => t[0] === "clone").map((t: string[]) => t[1]);

      // Extract event data
      const web = (event.tags || [])
        .filter((t: string[]) => t[0] === "web")
        .flatMap((t: string[]) => t.slice(1));
      const clone = (event.tags || [])
        .filter((t: string[]) => t[0] === "clone")
        .flatMap((t: string[]) => t.slice(1));

      // If we already have this repo, merge maintainers (duplicate announcement)
      if (byCompositeKey.has(compositeKey)) {
        const existing = byCompositeKey.get(compositeKey)!;
        // Add this event's author as maintainer if not already present
        if (event.pubkey && !existing.maintainers.includes(event.pubkey)) {
          existing.maintainers.push(event.pubkey);
        }
        // Merge web/clone URLs
        existing.web = Array.from(new Set([...existing.web, ...web]));
        existing.clone = Array.from(new Set([...existing.clone, ...clone]));
        continue;
      }

      let mStore = maintainersStoreByEuc.get(euc);
      if (!mStore) {
        mStore = deriveMaintainersForEuc(euc);
        maintainersStoreByEuc.set(euc, mStore);
      }
      const maintainers = Array.from(mStore.get() || []).filter((pk: any) => isValidPubkey(pk as string));
      let rStore = refStateStoreByEuc.get(euc);
      if (!rStore) {
        rStore = deriveRepoRefState(euc);
        refStateStoreByEuc.set(euc, rStore);
      }
      const refs = rStore.get() || {};
      const first = event;
      let title = euc;
      let description = "";
      try {
        if (first) {
          const parsed = parseRepoAnnouncementEvent(first);
          if (parsed?.name) title = parsed.name;
          if (parsed?.description) description = parsed.description;
        }
      } catch {}
      // Compute principal maintainer and naddr for navigation
      // Use first valid maintainer, or fall back to event pubkey if valid
      const principal = maintainers.length > 0 && isValidPubkey(maintainers[0] as string)
        ? maintainers[0]
        : isValidPubkey((first as any)?.pubkey)
        ? (first as any)?.pubkey
        : "";
      const repoNaddr = (() => {
        try {
          if (!principal || !title) return "";
          const relays = Router.get().FromPubkeys([principal]).getUrls();
          return nip19.naddrEncode({ pubkey: principal, kind: 30617, identifier: title, relays });
        } catch {
          return "";
        }
      })();

      let rootsCount = 0;
      let revisionsCount = 0;
      try {
        if (first) {
          const addrA = Address.fromEvent(first).toString();
          let dStore = patchDagStoreByAddr.get(addrA);
          if (!dStore) {
            dStore = derivePatchGraph(addrA);
            patchDagStoreByAddr.set(addrA, dStore);
          }
          const dag: any = dStore.get();
          rootsCount = Array.isArray(dag?.roots)
            ? dag.roots.length
            : typeof dag?.nodeCount === "number"
              ? Math.min(1, dag.nodeCount)
              : 0;
          revisionsCount = Array.isArray(dag?.rootRevisions)
            ? dag.rootRevisions.length
            : typeof dag?.edgesCount === "number"
              ? dag.edgesCount
              : 0;
        }
      } catch {}
      const card: RepoCard = {
        euc,
        web: Array.from(new Set(web)) as string[],
        clone: Array.from(new Set(clone)) as string[],
        // Ensure maintainers are filtered to only valid pubkeys
        maintainers: maintainers.filter((pk: any) => isValidPubkey(pk)) as string[],
        refs,
        rootsCount,
        revisionsCount,
        title,
        description,
        first,
        principal,
        repoNaddr,
      };
      byCompositeKey.set(compositeKey, card);
    }

    return Array.from(byCompositeKey.values());
  }

  return {
    subscribe,
    set,
    update,
    clear: () => set([]),
    computeCards,
  };
}

export const repositoriesStore = createRepositoriesStore();