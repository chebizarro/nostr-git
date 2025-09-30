import { writable, type Readable } from "svelte/store";
import type { ThunkFunction } from "../internal/function-registry";
// Avoid strict type coupling across packages by defining minimal local types
export type RepoGroup = {
  euc: string;
  repos: any[];
  handles: string[];
  web: string[];
  clone: string[];
  relays: string[];
  maintainers: string[];
  name: string;
};
export type IO = {
  fetchEvents: (filters: any[]) => Promise<any[]>;
  publishEvent?: (evt: any) => Promise<any>;
};

export type RepositoriesStore = Readonly<Readable<RepoGroup[]>> & {
  refresh: () => Promise<void>;
  setIO: (io: IO) => void;
  isLoading: Readable<boolean>;
  error: Readable<Error | null>;
};

// Event payload understood by the injected thunk
export type RepoFetchEvent = {
  filters: any[];
  onResult: (events: any[]) => void;
};

export function createRepositoriesStore(
  initialIO: IO,
  loaderThunk: ThunkFunction<RepoFetchEvent>
): RepositoriesStore {
  let io = initialIO;
  const data = writable<RepoGroup[]>([]);
  const loading = writable<boolean>(false);
  const error = writable<Error | null>(null);

  async function refresh() {
    loading.set(true);
    error.set(null);
    try {
      // Wrap the thunk callback in a promise so callers can await refresh()
      const groups = await new Promise<RepoGroup[]>((resolve, reject) => {
        let done = false;
        const controller = loaderThunk({
          filters: [{ kinds: [30617] }],
          onResult: (events: any[]) => {
            if (done) return;
            done = true;
            try {
              // Group events by EUC using the same shape expected by RepoGroup
              const by: Record<string, RepoGroup> = {};
              for (const evt of events || []) {
                const tags: string[][] = (evt.tags || []) as string[][];
                const euc = tags.find((t) => t[0] === "r" && t[2] === "euc")?.[1];
                if (!euc) continue;
                const d = tags.find((t) => t[0] === "d")?.[1];
                const web = tags.filter((t) => t[0] === "web").flatMap((t) => t.slice(1));
                const clone = tags.filter((t) => t[0] === "clone").flatMap((t) => t.slice(1));
                const relays = tags.filter((t) => t[0] === "relays").flatMap((t) => t.slice(1));
                const maint = tags.find((t) => t[0] === "maintainers") || [];
                const maintainers = maint.slice(1);
                if (evt.pubkey && !maintainers.includes(evt.pubkey)) maintainers.push(evt.pubkey);
                const name = tags.find((t) => t[0] === "name")?.[1] || "";

                if (!by[euc]) by[euc] = { euc, repos: [], handles: [], web: [], clone: [], relays: [], maintainers: [], name };
                const g = by[euc];
                g.repos.push(evt);
                if (d) g.handles.push(d);
                g.web.push(...web);
                g.clone.push(...clone);
                g.relays.push(...relays);
                g.maintainers.push(...maintainers);
              }
              const out = Object.values(by).map((g) => ({
                ...g,
                handles: Array.from(new Set(g.handles)),
                web: Array.from(new Set(g.web)),
                clone: Array.from(new Set(g.clone)),
                relays: Array.from(new Set(g.relays)),
                maintainers: Array.from(new Set(g.maintainers)),
              }));
              resolve(out);
            } catch (e) {
              reject(e);
            }
          },
        });
        // If the thunk gives us an AbortController, auto-timeout as safety (optional)
        if (controller?.controller instanceof AbortController) {
          const to = setTimeout(() => {
            try { controller.controller.abort("repositories: timeout"); } catch {}
            if (!done) reject(new Error("repositories: fetch timeout"));
          }, 15000);
          // Best-effort cleanup if already resolved
          (controller.controller.signal as any)?.addEventListener?.("abort", () => clearTimeout(to));
        }
      });
      data.set(groups);
    } catch (e: any) {
      error.set(e instanceof Error ? e : new Error(String(e)));
    } finally {
      loading.set(false);
    }
  }

  function setIO(next: IO) {
    io = next;
  }

  // Initial lazy load trigger left to the caller (host app can call refresh())

  return Object.assign(data, {
    refresh,
    setIO,
    isLoading: loading,
    error,
  });
}
