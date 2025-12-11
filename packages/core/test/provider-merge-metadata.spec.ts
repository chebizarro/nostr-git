import { describe, it, expect } from 'vitest'
import { NostrGitProvider } from '../src/index.js'
import type { EventIO, NostrEvent } from '@nostr-git/shared-types'

function mkFakeEventIO() {
  const store: NostrEvent[] = []
  const io: EventIO = {
    async publishEvent(evt: any) {
      const id = `${evt.kind}-${store.length + 1}`
      const now = Math.floor(Date.now() / 1000)
      const full = { id, created_at: now, pubkey: evt.pubkey || 'pk', sig: evt.sig || 'sig', ...evt }
      store.push(full as NostrEvent)
      return { ok: true, relays: ['test://publish'] }
    },
    async fetchEvents(filters: any[]) {
      const results: NostrEvent[] = []
      for (const f of filters) {
        for (const evt of store) {
          if (f.kinds && !f.kinds.includes(evt.kind)) continue
          if (f['#a']) {
            const aVals = (evt.tags as string[][]).filter(t => t[0] === 'a').map(t => t[1])
            if (!aVals.some(v => f['#a'].includes(v))) continue
          }
          if (f['#e']) {
            const eVals = (evt.tags as string[][]).filter(t => t[0] === 'e').map(t => t[1])
            if (!eVals.some(v => f['#e'].includes(v))) continue
          }
          results.push(evt)
        }
      }
      return results
    },
  } as any
  return { io, store }
}

describe('NostrGitProvider merge metadata publish/fetch', () => {
  it('publishes merge metadata and fetches by repoAddr and root', async () => {
    const { io, store } = mkFakeEventIO()
    const provider = new NostrGitProvider({ eventIO: io as any })
    const repoAddr = '30617:owner:repo'
    const rootId = 'root-evt-1'

    const res = await provider.publishMergeMetadata({
      repoAddr,
      rootId,
      targetBranch: 'main',
      baseBranch: 'main',
      result: 'clean',
      mergeCommit: 'abcd1234',
    })
    expect(res.mergeEventId).toBeDefined()
    expect(store.some(e => e.kind === 30411)).toBe(true)

    const fetched = await provider.fetchMergeMetadata(repoAddr, { rootId })
    expect(fetched.length).toBeGreaterThan(0)
    expect(fetched.every(e => e.kind === 30411 || e.kind === 30412)).toBe(true)
  })

  it('publishes conflict metadata when result is conflict', async () => {
    const { io, store } = mkFakeEventIO()
    const provider = new NostrGitProvider({ eventIO: io as any })
    const repoAddr = '30617:owner:repo'
    const rootId = 'root-evt-2'

    const res = await provider.publishMergeMetadata({
      repoAddr,
      rootId,
      targetBranch: 'main',
      result: 'conflict',
      conflictFiles: ['src/a.ts', 'src/b.ts'],
    })
    expect(res.mergeEventId).toBeDefined()
    expect(store.some(e => e.kind === 30412)).toBe(true)
  })
})

describe('NostrGitProvider mergeAndPublishMetadata workflow', () => {
  it('publishes clean metadata after successful merge', async () => {
    const { io, store } = mkFakeEventIO()
    const provider = new NostrGitProvider({ eventIO: io as any })
    ;(provider as any).baseGitProvider = {
      merge: async () => ({ oid: 'deadbeef' })
    }
    const repoAddr = '30617:owner:repo'
    const rootId = 'root-evt-3'
    const { mergeResult, published } = await provider.mergeAndPublishMetadata({
      mergeArgs: { dir: '/tmp/repo', ours: 'refs/heads/main', theirs: 'refs/heads/feature' },
      repoAddr,
      rootId,
      targetBranch: 'main',
      baseBranch: 'main',
    })
    expect(mergeResult.oid).toBe('deadbeef')
    expect(published.mergeEventId).toBeDefined()
    expect(store.some(e => e.kind === 30411)).toBe(true)
  })

  it('publishes conflict metadata when merge throws', async () => {
    const { io, store } = mkFakeEventIO()
    const provider = new NostrGitProvider({ eventIO: io as any })
    ;(provider as any).baseGitProvider = {
      merge: async () => {
        const err: any = new Error('conflicts')
        err.conflictFiles = ['src/conflict.ts']
        throw err
      }
    }
    const repoAddr = '30617:owner:repo'
    const rootId = 'root-evt-4'
    const { mergeResult, published } = await provider.mergeAndPublishMetadata({
      mergeArgs: { dir: '/tmp/repo', ours: 'refs/heads/main', theirs: 'refs/heads/feature' },
      repoAddr,
      rootId,
      targetBranch: 'main',
      baseBranch: 'main',
    })
    expect(mergeResult.error).toBeInstanceOf(Error)
    expect(published.mergeEventId).toBeDefined()
    expect(store.some(e => e.kind === 30412)).toBe(true)
  })
})
