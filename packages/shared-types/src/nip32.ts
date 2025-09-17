// NIP-32 label helpers
// Pure functions only. No I/O.

import type {Event} from "nostr-tools"

export type NostrEvent = Event
export type Label = {namespace?: string; value: string; mark?: string}
export type EffectiveLabels = {
  self: Label[]
  external: Label[]
  t: string[]
  normalized: string[] // e.g., "status/open", "type/bug"
}

// New typed interfaces requested by convergence spec
export interface LabelNamespace {
  value: string // e.g., "com.nostr.git.status" or "#t"
}

export interface LabelValue {
  value: string // e.g., "open", "bug", "area/ui"
  namespace: string // must match an 'L' tag mark when present; else 'ugc' implied
}

export interface LabelTargets {
  e?: string[] // event ids
  a?: string[] // addresses
  p?: string[] // pubkeys
  r?: string[] // relays
  t?: string[] // topics
}

export interface EffectiveLabelsInput {
  self: Array<{L?: string; l: string; targetKind: number}>
  external: Array<{namespace: string; value: string; targets: LabelTargets}>
  t: string[] // lightweight legacy tags
}

export interface EffectiveLabelsV2 {
  byNamespace: Record<string, Set<string>>
  flat: Set<string> // normalized "namespace/value" strings
  legacyT: Set<string>
}

export function extractSelfLabels(evt: NostrEvent): Label[] {
  const L = evt.tags.filter(t => t[0] === "L").map(t => t[1])
  const labels: Label[] = []
  for (const tag of evt.tags) {
    if (tag[0] !== "l") continue
    const [_, value, mark] = tag as [string, string, string?]
    const ns = mark && L.includes(mark) ? mark : undefined
    labels.push({namespace: ns, value, mark})
  }
  return labels
}

export function extractLabelEvents(events: NostrEvent[]): Label[] {
  const out: Label[] = []
  for (const evt of events) {
    const namespaces = evt.tags.filter(t => t[0] === "L").map(t => t[1])
    for (const tag of evt.tags) {
      if (tag[0] !== "l") continue
      const [_, value, mark] = tag as [string, string, string?]
      const ns = mark && namespaces.includes(mark) ? mark : undefined
      out.push({namespace: ns, value, mark})
    }
  }
  return out
}

export function mergeEffectiveLabels(args: {
  self: Label[]
  external: Label[]
  t: string[]
}): EffectiveLabels {
  const normalized: string[] = []
  const push = (label: Label) => {
    if (!label.value) return
    const ns = label.namespace?.trim()
    if (ns) normalized.push(`${ns}/${label.value}`)
  }
  args.self.forEach(push)
  args.external.forEach(push)
  // lightweight t tags
  args.t.forEach(v => normalized.push(`t/${v}`))
  return {self: args.self, external: args.external, t: args.t, normalized}
}

// ---------------------------------------------------------------------------
// V2 API (non-breaking additions) for convergence spec
// These mirror the requested shapes while keeping the original helpers intact.

export interface LabelNamespace {
  value: string // e.g., "com.nostr.git.status" or "#t"
}

export interface LabelValue {
  value: string // e.g., "open", "bug", "area/ui"
  namespace: string // must match an 'L' tag mark when present; else 'ugc' implied
}

export interface LabelTargets {
  e?: string[] // event ids
  a?: string[] // addresses
  p?: string[] // pubkeys
  r?: string[] // relays
  t?: string[] // topics
}

export interface EffectiveLabelsInput {
  self: Array<{L?: string; l: string; targetKind: number}>
  external: Array<{namespace: string; value: string; targets: LabelTargets}>
  t: string[] // lightweight legacy tags
}

export interface EffectiveLabelsV2 {
  byNamespace: Record<string, Set<string>>
  flat: Set<string> // normalized "namespace/value" strings
  legacyT: Set<string>
}

/** Extract author self-labels into EffectiveLabelsInput.self shape. */
export function extractSelfLabelsV2(evt: unknown): EffectiveLabelsInput["self"] {
  const e = evt as NostrEvent
  const L = e.tags.filter(t => t[0] === "L").map(t => t[1])
  const out: EffectiveLabelsInput["self"] = []
  for (const tag of e.tags) {
    if (tag[0] !== "l") continue
    const [_, value, mark] = tag as [string, string, string?]
    const ns = mark && L.includes(mark) ? mark : undefined
    out.push({L: ns, l: value, targetKind: e.kind})
  }
  return out
}

/** Extract external label events (kind 1985) into EffectiveLabelsInput.external entries. */
export function extractLabelEventsV2(events: unknown[]): EffectiveLabelsInput["external"] {
  const out: EffectiveLabelsInput["external"] = []
  for (const raw of events as NostrEvent[]) {
    const namespaces = raw.tags.filter(t => t[0] === "L").map(t => t[1])
    for (const tag of raw.tags) {
      if (tag[0] !== "l") continue
      const [_, value, mark] = tag as [string, string, string?]
      const ns = mark && namespaces.includes(mark) ? mark : "ugc"
      const targets: LabelTargets = {}
      for (const t of raw.tags as string[][]) {
        if (t[0] === "e") targets.e = [...(targets.e || []), t[1]]
        if (t[0] === "a") targets.a = [...(targets.a || []), t[1]]
        if (t[0] === "p") targets.p = [...(targets.p || []), t[1]]
        if (t[0] === "r") targets.r = [...(targets.r || []), t[1]]
        if (t[0] === "t") targets.t = [...(targets.t || []), t[1]]
      }
      out.push({namespace: ns, value, targets})
    }
  }
  return out
}

/** Merge self/external labels plus legacy t into normalized sets. */
export function mergeEffectiveLabelsV2(input: EffectiveLabelsInput): EffectiveLabelsV2 {
  const byNamespace: Record<string, Set<string>> = {}
  const flat = new Set<string>()
  const legacyT = new Set<string>(input.t)

  const push = (ns: string | undefined, value: string) => {
    const namespace = ns || "ugc"
    byNamespace[namespace] = byNamespace[namespace] || new Set<string>()
    byNamespace[namespace].add(value)
    flat.add(`${namespace}/${value}`)
  }

  for (const s of input.self) push(s.L, s.l)
  for (const e of input.external) push(e.namespace, e.value)
  for (const t of input.t) push("#t", t)

  return {byNamespace, flat, legacyT}
}
