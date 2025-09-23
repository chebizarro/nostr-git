// @nostr-git/core: labels32.ts
// Merge labels from NIP-32 style sources (self labels, external 1985, legacy #t)

import type { NostrEvent } from "@nostr-git/shared-types";

export type LabelNS = "nip34.x" | "#t" | string;

export function mergeEffectiveLabels(args: {
  selfLabels: NostrEvent[];
  external1985: NostrEvent[];
  legacyT: string[];
}): { normalized: Record<string, string[]>; chips: string[] } {
  const normalized: Record<string, Set<string>> = {};

  function add(ns: LabelNS, value: string) {
    const key = ns.toString();
    if (!normalized[key]) normalized[key] = new Set<string>();
    if (value && value.trim().length > 0) normalized[key].add(value.trim());
  }

  // Self labels (t-tags and potentially namespaced labels via tags)
  for (const e of args.selfLabels) {
    for (const t of e.tags as string[][]) {
      if (t[0] === "t" && t[1]) add("#t", t[1]);
      // Support namespaced label tags like ["l", value, ns]
      if (t[0] === "l" && t[1]) add(t[2] || "nip34.x", t[1]);
    }
  }

  // External 1985 events: ["label", value, ns?] or ["t", value]
  for (const e of args.external1985) {
    for (const t of e.tags as string[][]) {
      if (t[0] === "label" && t[1]) add(t[2] || "nip34.x", t[1]);
      if (t[0] === "t" && t[1]) add("#t", t[1]);
    }
  }

  // Legacy #t values from content or upstream heuristics
  for (const v of args.legacyT) {
    if (v) add("#t", v);
  }

  const out: Record<string, string[]> = {};
  const chips: string[] = [];
  for (const [ns, set] of Object.entries(normalized)) {
    out[ns] = Array.from(set).sort((a, b) => a.localeCompare(b));
    for (const v of out[ns]) chips.push(v);
  }

  return { normalized: out, chips };
}
