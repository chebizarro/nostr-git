import { writable, derived, type Readable } from "svelte/store";
import type {
  NostrEvent,
  NostrFilter,
  EventIO,
  SignEvent,
} from "@nostr-git/shared-types";

type Source = "30002" | "10003";

export interface GraspServersSnapshot {
  urls: string[];
  source: Source | null;
  event?: NostrEvent;
}

function normalize(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "wss:") return null;
    u.hash = "";
    u.search = "";
    // Trim trailing slash from pathname
    if (u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    // Lowercase host
    u.host = u.host.toLowerCase();
    // Build normalized string without trailing slash at root
    const path = u.pathname === "/" || u.pathname === "" ? "" : u.pathname;
    return `${u.protocol}//${u.host}${path}`;
  } catch {
    return null;
  }
}

export function createGraspServersStore(initialUrls: string[] = []) {
  const urls = writable<string[]>([]);
  const source = writable<Source | null>(null);
  const lastEvent = writable<NostrEvent | undefined>(undefined);

  const snapshot: Readable<GraspServersSnapshot> = derived(
    [urls, source, lastEvent],
    ([$urls, $source, $evt]) => ({ urls: $urls, source: $source, event: $evt })
  );

  if (initialUrls.length > 0) {
    const normalized = Array.from(
      new Set(
        initialUrls
          .map((u) => normalize(u))
          .filter((u): u is string => Boolean(u))
      )
    );

    if (normalized.length > 0) {
      urls.set(normalized);
      source.set("30002");
      lastEvent.set(undefined);
    }
  }

  async function load(io: EventIO, authorPubkey: string): Promise<void> {
    console.log('[graspServers] load: START', { authorPubkey });

    // Prefer set (30002) with d="grasp-servers"
    const setFilters: NostrFilter[] = [
      ({ kinds: [30002], authors: [authorPubkey], "#d": ["grasp-servers"], limit: 5 } as unknown as NostrFilter),
    ];
    console.log('[graspServers] load: Fetching 30002 events...');
    const setEvents = await io.fetchEvents(setFilters);
    const [setEvt] = setEvents.sort((a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at);
    if (setEvt) {
      const s = new Set<string>();
      for (const t of setEvt.tags) if (t[0] === "relay" && t[1]) { const n = normalize(t[1]); if (n) s.add(n); }
      console.log('[graspServers] load: Found 30002 event', {
        eventId: setEvt.id,
        created_at: setEvt.created_at,
        relayCount: s.size,
        relays: [...s],
      });
      urls.set([...s]);
      source.set("30002");
      lastEvent.set(setEvt);
      return;
    }
    console.log('[graspServers] load: No 30002 event found, trying 10003...');

    // Fallback legacy bookmarks (10003)
    const bmFilters: NostrFilter[] = [({ kinds: [10003], authors: [authorPubkey], limit: 5 } as unknown as NostrFilter)];
    console.log('[graspServers] load: Fetching 10003 events...');
    const bmEvents = await io.fetchEvents(bmFilters);
    const [bmEvt] = bmEvents.sort((a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at);
    if (bmEvt) {
      const s = new Set<string>();
      for (const t of bmEvt.tags) if (t[0] === "r" && t[1]?.startsWith("wss://")) { const n = normalize(t[1]); if (n) s.add(n); }
      console.log('[graspServers] load: Found 10003 event', {
        eventId: bmEvt.id,
        created_at: bmEvt.created_at,
        relayCount: s.size,
        relays: [...s],
      });
      urls.set([...s]);
      source.set("10003");
      lastEvent.set(bmEvt);
      return;
    }

    console.log('[graspServers] load: No events found, starting with empty 30002');
    // Default empty 30002
    urls.set([]);
    source.set("30002");
    lastEvent.set(undefined);
  }

  function add(url: string): void {
    const n = normalize(url); if (!n) return;
    urls.update(arr => (arr.includes(n) ? arr : [...arr, n]));
  }

  function remove(url: string): void {
    const n = normalize(url); if (!n) return;
    urls.update(arr => arr.filter(x => x !== n));
  }

  async function save(io: EventIO, sign: SignEvent, _authorPubkey: string): Promise<NostrEvent> {
    let $source: Source | null = null; let $urls: string[] = [];
    const u1 = source.subscribe(v => $source = v); const u2 = urls.subscribe(v => $urls = v);
    u1(); u2();

    console.log('[graspServers] save: START', {
      source: $source,
      urlCount: $urls.length,
      urls: $urls,
    });

    const created_at = Math.floor(Date.now() / 1000);

    if ($source === "10003") {
      console.log('[graspServers] save: Using 10003 format');
      const tags: string[][] = [];
      for (const u of $urls) tags.push(["r", u]);
      const unsigned = { kind: 10003, created_at, tags, content: "" } as Omit<NostrEvent, "id" | "pubkey" | "sig">;
      console.log('[graspServers] save: Signing 10003 event...');
      const signed = await sign(unsigned);
      console.log('[graspServers] save: Publishing 10003 event...', { eventId: signed.id });
      const res = await io.publishEvent(signed);
      if (!res.ok) {
        console.error('[graspServers] save: FAILED to publish 10003', res);
        throw new Error(res.error || "Failed to publish 10003 replacement");
      }
      console.log('[graspServers] save: SUCCESS (10003)');
      lastEvent.set(signed);
      return signed;
    }

    console.log('[graspServers] save: Using 30002 format');
    const tags: string[][] = [["d", "grasp-servers"]];
    for (const u of $urls) tags.push(["relay", u]);
    const unsigned = { kind: 30002, created_at, tags, content: "" } as Omit<NostrEvent, "id" | "pubkey" | "sig">;
    console.log('[graspServers] save: Signing 30002 event...', { tags });
    const signed = await sign(unsigned);
    console.log('[graspServers] save: Publishing 30002 event...', { eventId: signed.id });
    const res = await io.publishEvent(signed);
    if (!res.ok) {
      console.error('[graspServers] save: FAILED to publish 30002', res);
      throw new Error(res.error || "Failed to publish 30002 replacement");
    }
    console.log('[graspServers] save: SUCCESS (30002)');
    lastEvent.set(signed);
    source.set("30002");
    return signed;
  }

  return {
    urls,
    snapshot,
    load,
    add,
    remove,
    save,
    subscribe: snapshot.subscribe,
  } as const;
}

export const __testing = { normalize };
