import { writable, type Readable } from "svelte/store";
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
import { loadRepositories as coreLoadRepositories } from "@nostr-git/core";

export type RepositoriesStore = Readonly<Readable<RepoGroup[]>> & {
  refresh: () => Promise<void>;
  setIO: (io: IO) => void;
  isLoading: Readable<boolean>;
  error: Readable<Error | null>;
};

export type RepoLoader = (io: IO) => Promise<RepoGroup[]>;

export function createRepositoriesStore(initialIO: IO, loader: RepoLoader): RepositoriesStore {
  let io = initialIO;
  const data = writable<RepoGroup[]>([]);
  const loading = writable<boolean>(false);
  const error = writable<Error | null>(null);

  async function refresh() {
    loading.set(true);
    error.set(null);
    try {
      const groups = await loader(io);
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
