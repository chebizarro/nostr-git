import type { PatchEvent } from '@nostr-git/shared-types'
import { getTag, getTagValue } from '@nostr-git/shared-types'

export type StackMemberRef = { id?: string; commit?: string }

export type StackDescriptor = {
  id: string
  repoAddr: string
  members: StackMemberRef[]
  order?: string[]
  raw: any
}

export function extractStackIdFromPatch(evt: PatchEvent): string | undefined {
  return getTagValue(evt, 'stack')
}

export function extractRevisionIdFromPatch(evt: PatchEvent): string | undefined {
  return getTagValue(evt, 'rev')
}

export function extractSupersedesFromPatch(evt: PatchEvent): string | undefined {
  return getTagValue(evt, 'supersedes')
}

export function extractDependsFromPatch(evt: PatchEvent): string[] {
  return (evt.tags as string[][]).filter(t => t[0] === 'depends').map(t => t[1])
}

export function parseStackEvent(evt: any): StackDescriptor | undefined {
  if (evt?.kind !== 30410) return undefined
  const repoAddr = getTagValue(evt, 'a') || ''
  const id = getTagValue(evt, 'stack') || ''
  const members = (evt.tags as string[][])
    .filter(t => t[0] === 'member')
    .map(t => ({ id: t[1] }))
  const orderTag = getTag(evt, 'order') as any
  const order = orderTag ? (orderTag as string[]).slice(1) : undefined
  return { id, repoAddr, members, order, raw: evt }
}

export class StackManager {
  private stacks = new Map<string, StackDescriptor>()

  upsert(evt: any) {
    const d = parseStackEvent(evt)
    if (!d) return
    const key = `${d.repoAddr}:${d.id}`
    this.stacks.set(key, d)
  }

  get(repoAddr: string, stackId: string): StackDescriptor | undefined {
    return this.stacks.get(`${repoAddr}:${stackId}`)
  }
}
