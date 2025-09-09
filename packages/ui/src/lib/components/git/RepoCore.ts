import type { NostrEvent } from '@nostr-git/shared-types'
import {
  parseRepoAnnouncementEvent,
  parseRepoStateEvent,
  type RepoAnnouncementEvent,
  type RepoStateEvent,
  type IssueEvent,
  type PatchEvent,
} from '@nostr-git/shared-types'

export type RepoContext = {
  repoEvent?: RepoAnnouncementEvent
  repoStateEvent?: RepoStateEvent
  repo?: ReturnType<typeof parseRepoAnnouncementEvent>
  issues?: IssueEvent[]
  patches?: PatchEvent[]
  repoStateEventsArr?: RepoStateEvent[]
  statusEventsArr?: NostrEvent[]
  commentEventsArr?: NostrEvent[]
  labelEventsArr?: NostrEvent[]
}

function getOwnerPubkey(ctx: RepoContext): string {
  const owner = ctx.repo?.owner?.trim()
  if (owner) return owner
  return (ctx.repoEvent?.pubkey || '').trim()
}

function isTrusted(ctx: RepoContext, pubkey?: string): boolean {
  if (!pubkey) return false
  const owner = getOwnerPubkey(ctx)
  if (pubkey === owner) return true
  return (ctx.repo?.maintainers || []).includes(pubkey)
}

export function trustedMaintainers(ctx: RepoContext): string[] {
  const out = new Set<string>(ctx.repo?.maintainers || [])
  const owner = getOwnerPubkey(ctx)
  if (owner) out.add(owner)
  return Array.from(out)
}

export function mergeRepoStateByMaintainers(ctx: RepoContext, events: RepoStateEvent[]): Map<string, { commitId: string; type: 'heads'|'tags'; fullRef: string }> {
  const merged = new Map<string, { commitId: string; type: 'heads'|'tags'; fullRef: string; at: number }>()
  for (const ev of events) {
    if (!isTrusted(ctx, ev.pubkey)) continue
    const parsed = parseRepoStateEvent(ev) as any
    const at = (ev as any).created_at || 0
    let refs = parsed?.refs || []
    // Fallback: reconstruct from legacy 'r' tags (pairs of ref/commit)
    if (!refs || refs.length === 0) {
      const tags: any[] = (ev as any).tags || []
      let lastRef: string | null = null
      const out: any[] = []
      for (const t of tags) {
        if (t[0] !== 'r') continue
        if (t[2] === 'ref') lastRef = t[1]
        else if (t[2] === 'commit' && lastRef) {
          out.push({ ref: lastRef, commit: t[1] })
          lastRef = null
        }
      }
      refs = out
    }
    for (const ref of refs) {
      const fullRef: string = ref.ref ?? (ref.type && ref.name ? `refs/${ref.type}/${ref.name}` : '')
      if (!fullRef) continue
      const m = /^refs\/(heads|tags)\/(.+)$/.exec(fullRef)
      if (!m) continue
      const type = m[1] as 'heads'|'tags'
      const name = m[2]
      const key = `${type}:${name}`
      const prev = merged.get(key)
      const commitId: string = ref.commit || ''
      if (!prev || at > prev.at) {
        merged.set(key, { commitId, type, fullRef, at })
      }
    }
  }
  const out = new Map<string, { commitId: string; type: 'heads'|'tags'; fullRef: string }>()
  for (const [k, v] of merged.entries()) out.set(k, { commitId: v.commitId, type: v.type, fullRef: v.fullRef })
  return out
}

export function getPatchGraph(ctx: RepoContext): { nodes: Map<string, PatchEvent>; roots: string[]; rootRevisions: string[]; edgesCount: number; topParents: string[]; parentOutDegree: Record<string, number> } {
  const nodes = new Map<string, PatchEvent>()
  const edges = new Map<string, Set<string>>()
  const roots: string[] = []
  const rootRevisions: string[] = []
  const getTags = (evt: any, k: string) => (evt.tags || []).filter((t: string[]) => t[0] === k)
  for (const p of ctx.patches || []) nodes.set(p.id, p)
  for (const p of ctx.patches || []) {
    const parents = [
      ...getTags(p, 'e').map((t: string[]) => t[1]),
      ...getTags(p, 'E').map((t: string[]) => t[1]),
    ]
    for (const parent of parents) {
      if (!nodes.has(parent)) continue
      const set = edges.get(parent) || new Set<string>()
      set.add(p.id)
      edges.set(parent, set)
    }
    const tTags = getTags(p, 't').map((t: string[]) => t[1])
    if (tTags.includes('root')) roots.push(p.id)
    if (tTags.includes('root-revision')) rootRevisions.push(p.id)
  }
  const edgesCount = Array.from(edges.values()).reduce((acc, s) => acc + s.size, 0)
  const topParents = Array.from(edges.entries()).sort((a, b) => b[1].size - a[1].size).slice(0, 10).map(([id]) => id)
  const parentOutDegree: Record<string, number> = {}
  for (const [pid, set] of edges.entries()) parentOutDegree[pid] = set.size
  return { nodes, roots: Array.from(new Set(roots)), rootRevisions: Array.from(new Set(rootRevisions)), edgesCount, topParents, parentOutDegree }
}

export function resolveStatusFor(ctx: RepoContext, rootId: string): { state: 'open'|'draft'|'closed'|'merged'|'resolved'; by: string; at: number; eventId: string } | null {
  if (!ctx.statusEventsArr || ctx.statusEventsArr.length === 0) return null
  const rootAuthor = findRootAuthor(ctx, rootId)
  const rootIsIssue = !!(ctx.issues || []).find(i => i.id === rootId)
  const kindToState = (kind: number): 'open'|'draft'|'closed'|'merged'|'resolved' => {
    if (kind === 1630) return 'open'
    if (kind === 1633) return 'draft'
    if (kind === 1632) return 'closed'
    if (kind === 1631) return rootIsIssue ? 'resolved' : 'merged'
    return 'open'
  }
  const events = ctx.statusEventsArr
    .filter((ev) => (ev.tags || []).some((t: string[]) => t[0] === 'e' && t[1] === rootId))
    .filter((ev) => isTrusted(ctx, ev.pubkey) || (!!rootAuthor && ev.pubkey === rootAuthor))
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
  const last = events.at(-1)
  if (!last) return null
  const state = kindToState((last as any).kind)
  return { state, by: last.pubkey, at: (last as any).created_at || 0, eventId: last.id }
}

function findRootAuthor(ctx: RepoContext, rootId: string): string | undefined {
  const root = (ctx.issues || []).find(i => i.id === rootId) || (ctx.patches || []).find(p => p.id === rootId)
  return root?.pubkey
}

export function getIssueThread(ctx: RepoContext, rootId: string): { rootId: string; comments: NostrEvent[] } {
  const out: NostrEvent[] = []
  if (!ctx.commentEventsArr) return { rootId, comments: out }
  for (const ev of ctx.commentEventsArr) {
    const tags = (ev.tags || []) as string[][]
    const hasE = tags.some(t => (t[0] === 'e' || t[0] === 'E') && t[1] === rootId)
    if (hasE) out.push(ev)
  }
  return { rootId, comments: out.sort((a, b) => (a.created_at || 0) - (b.created_at || 0)) }
}

// Labels
export type EffectiveLabelsV2 = { byNamespace: Record<string, Set<string>>; flat: Set<string>; legacyT: Set<string> }
import { extractSelfLabelsV2, extractLabelEventsV2, mergeEffectiveLabelsV2 } from '@nostr-git/shared-types'

export function getEffectiveLabelsFor(ctx: RepoContext, target: { id?: string; address?: string; euc?: string }): EffectiveLabelsV2 {
  const selfEvt = target.id ? ((ctx.issues || []).find(i => i.id === target.id) || (ctx.patches || []).find(p => p.id === target.id)) : undefined
  const self = selfEvt ? extractSelfLabelsV2(selfEvt as any) : []
  const external = extractLabelEventsV2((ctx.labelEventsArr || []) as any)
  const legacyT = new Set<string>((selfEvt?.tags || []).filter((t: any[]) => t[0] === 't').map(t => t[1]))
  return mergeEffectiveLabelsV2({ self, external, t: Array.from(legacyT) }) as EffectiveLabelsV2
}

export function getIssueLabels(ctx: RepoContext, rootId: string): EffectiveLabelsV2 { return getEffectiveLabelsFor(ctx, { id: rootId }) }
export function getPatchLabels(ctx: RepoContext, rootId: string): EffectiveLabelsV2 { return getEffectiveLabelsFor(ctx, { id: rootId }) }
export function getRepoLabels(ctx: RepoContext): EffectiveLabelsV2 {
  const address = ctx.repoEvent ? `30617:${getOwnerPubkey(ctx)}:${ctx.repo?.name || ''}` : ''
  return getEffectiveLabelsFor(ctx, { address })
}

export function getMaintainerBadge(ctx: RepoContext, pubkey: string): 'owner'|'maintainer'|null {
  if (!pubkey) return null
  const owner = getOwnerPubkey(ctx)
  if (pubkey === owner) return 'owner'
  if ((ctx.repo?.maintainers || []).includes(pubkey)) return 'maintainer'
  return null
}

export function getRecommendedFilters(ctx: RepoContext): any[] {
  const filters: any[] = []
  const a = ctx.repoEvent ? `30617:${getOwnerPubkey(ctx)}:${ctx.repo?.name || ''}` : undefined
  if (a) filters.push({ kinds: [30617, 1617, 1621, 1630, 1631, 1632, 1633], '#a': [a] })
  const roots = [ ...(ctx.issues || []), ...(ctx.patches || []) ].map(e => e.id)
  if (roots.length > 0) filters.push({ '#e': roots })
  const euc = (ctx.repoEvent?.tags || []).find(t => t[0] === 'r' && t[2] === 'euc')?.[1]
  if (euc) filters.push({ '#r': [euc] })
  return filters
}
