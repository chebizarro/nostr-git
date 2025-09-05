// NIP-32 label helpers
// Pure functions only. No I/O.

import type { Event } from 'nostr-tools';

export type NostrEvent = Event;
export type Label = { namespace?: string; value: string; mark?: string };
export type EffectiveLabels = {
  self: Label[];
  external: Label[];
  t: string[];
  normalized: string[]; // e.g., "status/open", "type/bug"
};

export function extractSelfLabels(evt: NostrEvent): Label[] {
  const L = evt.tags.filter(t => t[0] === 'L').map(t => t[1]);
  const labels: Label[] = [];
  for (const tag of evt.tags) {
    if (tag[0] !== 'l') continue;
    const [_, value, mark] = tag as [string, string, string?];
    const ns = mark && L.includes(mark) ? mark : undefined;
    labels.push({ namespace: ns, value, mark });
  }
  return labels;
}

export function extractLabelEvents(events: NostrEvent[]): Label[] {
  const out: Label[] = [];
  for (const evt of events) {
    const namespaces = evt.tags.filter(t => t[0] === 'L').map(t => t[1]);
    for (const tag of evt.tags) {
      if (tag[0] !== 'l') continue;
      const [_, value, mark] = tag as [string, string, string?];
      const ns = mark && namespaces.includes(mark) ? mark : undefined;
      out.push({ namespace: ns, value, mark });
    }
  }
  return out;
}

export function mergeEffectiveLabels(args: { self: Label[]; external: Label[]; t: string[] }): EffectiveLabels {
  const normalized: string[] = [];
  const push = (label: Label) => {
    if (!label.value) return;
    const ns = label.namespace?.trim();
    if (ns) normalized.push(`${ns}/${label.value}`);
  };
  args.self.forEach(push);
  args.external.forEach(push);
  // lightweight t tags
  args.t.forEach(v => normalized.push(`t/${v}`));
  return { self: args.self, external: args.external, t: args.t, normalized };
}
