import { writable, type Readable, get } from "svelte/store";
import {
  makeGraspServersUnsignedEvent,
  validateGraspServerUrl,
  DEFAULT_GRASP_SET_ID,
} from "@nostr-git/core";

export interface GraspServersState {
  urls: string[];
  loading: boolean;
  error: string | null;
  identifier: string; // NIP-51 d tag value
}

export interface GraspServersStore extends Readable<GraspServersState> {
  setUrls: (urls: string[]) => void;
  addUrl: (url: string) => void;
  removeUrl: (url: string) => void;
  buildUnsigned: (pubkey: string) => {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  };
}

export function createGraspServersStore(
  initialUrls: string[] = [],
  identifier: string = DEFAULT_GRASP_SET_ID
): GraspServersStore {
  const { subscribe, update } = writable<GraspServersState>({
    urls: initialUrls,
    loading: false,
    error: null,
    identifier,
  });

  function setUrls(urls: string[]) {
    update((s) => ({ ...s, urls }));
  }

  function addUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    update((s) => {
      const next = Array.from(new Set([...s.urls, trimmed]));
      return { ...s, urls: next };
    });
  }

  function removeUrl(url: string) {
    update((s) => ({ ...s, urls: s.urls.filter((u) => u !== url) }));
  }

  function buildUnsigned(pubkey: string) {
    return makeGraspServersUnsignedEvent({ pubkey, urls: getValidUrls(), identifier });
  }

  function getValidUrls(): string[] {
    const current = getCurrent();
    return current.urls
      .map((u) => u.trim().replace(/\/$/, ""))
      .filter((u) => !!u)
      .filter((u) => validateGraspServerUrl(u));
  }

  function getCurrent(): GraspServersState {
    return get({ subscribe });
  }

  return { subscribe, setUrls, addUrl, removeUrl, buildUnsigned };
}
