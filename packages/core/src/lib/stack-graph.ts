import type { PatchEvent } from '@nostr-git/shared-types'
import { getTagValue } from '@nostr-git/shared-types'

export type StackGraphNode = {
  key: string // stack key (stack-id or isolated patch key)
  revisions: string[] // ordered by supersedes chain
  latest: string // latest revision id
  depends: string[] // dependency ids (patch or commit ids)
  members: string[] // patch ids belonging to this key
}

function patchKey(evt: PatchEvent): string {
  // Prefer explicit stack id; fallback to commit or event id
  const sid = getTagValue(evt, 'stack')
  if (sid) return sid
  const commit = getTagValue(evt, 'commit')
  if (commit) return commit
  return evt.id
}

function revisionId(evt: PatchEvent): string {
  return getTagValue(evt, 'rev') || evt.id
}

function supersedesOf(evt: PatchEvent): string | undefined {
  return getTagValue(evt, 'supersedes')
}

function dependsOf(evt: PatchEvent): string[] {
  const tags = evt.tags as string[][]
  return tags.filter(t => t[0] === 'depends').map(t => t[1])
}

/**
 * Build a stack-aware graph over patches, folding revisions by (rev/supersedes) and capturing depends edges.
 */
export function buildStackGraph(patches: PatchEvent[]): Map<string, StackGraphNode> {
  const byKey = new Map<string, StackGraphNode>()
  const revIndex = new Map<string, string>() // revId -> key

  for (const evt of patches) {
    const key = patchKey(evt)
    const rev = revisionId(evt)
    const prev = supersedesOf(evt)
    const deps = dependsOf(evt)

    if (!byKey.has(key)) {
      byKey.set(key, { key, revisions: [], latest: rev, depends: [], members: [] })
    }
    const node = byKey.get(key)!

    // append rev while maintaining chain order (simple push; we adjust below if needed)
    if (!node.revisions.includes(rev)) node.revisions.push(rev)
    node.members.push(evt.id)
    node.depends = Array.from(new Set([...node.depends, ...deps]))

    // maintain latest pointer by supersedes
    if (prev && node.revisions.includes(prev)) {
      node.latest = rev
    } else if (!prev) {
      // first seen becomes latest unless later superseded
      node.latest = rev
    }

    revIndex.set(rev, key)
  }

  return byKey
}
