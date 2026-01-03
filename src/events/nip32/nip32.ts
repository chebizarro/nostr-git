// NIP-32 label helpers (unified API). Pure functions only. No I/O.
import type {Event} from "nostr-tools"

export const GIT_LABEL = 1985

export type NostrEvent = Event
export type Label = {namespace?: string; value: string; mark?: string}

export type LabelEvent = NostrEvent & { kind: typeof GIT_LABEL }

export interface LabelNamespace { value: string }
export interface LabelValue { value: string; namespace: string }
export interface LabelTargets {
  e?: string[]
  a?: string[]
  p?: string[]
  r?: string[]
  t?: string[]
}
export interface EffectiveLabelsInput {
  self: Array<{L?: string; l: string; targetKind: number}>
  external: Array<{namespace: string; value: string; targets: LabelTargets}>
  t: string[]
}
export interface EffectiveLabels {
  byNamespace: Record<string, Set<string>>
  flat: Set<string>
  legacyT: Set<string>
}

/** Extract author self-labels into EffectiveLabelsInput.self shape. */
export function extractSelfLabels(evt: unknown): EffectiveLabelsInput["self"] {
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
export function extractLabelEvents(events: unknown[]): EffectiveLabelsInput["external"] {
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
export function mergeEffectiveLabels(input: EffectiveLabelsInput): EffectiveLabels {
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