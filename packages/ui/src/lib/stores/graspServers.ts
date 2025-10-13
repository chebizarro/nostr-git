import { writable } from "svelte/store";

// Singleton store for GRASP servers (urls only), mirroring bookmarksStore simplicity
function createGraspServersStore() {
  const { subscribe, set, update } = writable<string[]>([]);

  return {
    subscribe,
    set,
    update,
    push: (url: string) =>
      update(urls => {
        const trimmed = (url || "").trim().replace(/\/$/, "");
        if (!trimmed) return urls;
        return urls.includes(trimmed) ? urls : [...urls, trimmed];
      }),
    remove: (url: string) => update(urls => urls.filter(u => u !== url)),
    clear: () => set([]),
  };
}

export const graspServersStore = createGraspServersStore();