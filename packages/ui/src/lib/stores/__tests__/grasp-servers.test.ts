import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGraspServersStore, __testing } from '../graspServers'
import type { NostrEvent, NostrFilter, EventIO, SignEvent } from '@nostr-git/shared-types'

function makeEvt(partial: Partial<NostrEvent>): NostrEvent {
  return {
    id: partial.id ?? 'id',
    pubkey: partial.pubkey ?? 'pub',
    created_at: partial.created_at ?? Math.floor(Date.now()/1000),
    kind: partial.kind ?? 1,
    tags: partial.tags ?? [],
    content: partial.content ?? '',
    sig: partial.sig ?? 'sig',
  }
}

describe('grasp-servers store', () => {
  let io: EventIO
  let sign: SignEvent

  beforeEach(() => {
    io = {
      fetchEvents: vi.fn().mockResolvedValue([]),
      publishEvent: vi.fn().mockResolvedValue({ ok: true })
    }
    sign = vi.fn(async (u) => makeEvt({ ...u, pubkey: 'pub', id: 'signed-id', sig: 'signed' }))
  })

  it('normalization()', () => {
    const { normalize } = __testing
    expect(normalize('wss://EXAMPLE.com/')).toBe('wss://example.com')
    expect(normalize('wss://example.com/path/')).toBe('wss://example.com/path')
    expect(normalize('wss://example.com/path?x=1#y')).toBe('wss://example.com/path')
    expect(normalize('ws://example.com')).toBeNull()
    expect(normalize('http://example.com')).toBeNull()
  })

  it('loadsFrom30002()', async () => {
    const store = createGraspServersStore()
    const evt = makeEvt({
      kind: 30002,
      created_at: 100,
      tags: [['d','grasp-servers'], ['relay','wss://Relay.ONE/'], ['relay','wss://relay.one/']],
      content: ''
    })
    ;(io.fetchEvents as any).mockImplementation(async (filters: NostrFilter[]) => {
      if (filters[0].kinds?.includes(30002)) return [evt]
      return []
    })

    await store.load(io, 'pub')
    let snap: any
    store.snapshot.subscribe((v: any) => (snap = v))()
    expect(snap.source).toBe('30002')
    expect(snap.urls).toEqual(['wss://relay.one'])
  })

  it('loadsFrom10003()', async () => {
    const store = createGraspServersStore()
    const evt = makeEvt({ kind: 10003, created_at: 200, tags: [['r','wss://relay.a'], ['r','not-relay']], content: '' })
    ;(io.fetchEvents as any).mockResolvedValueOnce([]) // first call: 30002
      .mockResolvedValueOnce([evt]) // second: 10003

    await store.load(io, 'pub')
    let snap: any
    store.snapshot.subscribe((v: any) => (snap = v))()
    expect(snap.source).toBe('10003')
    expect(snap.urls).toEqual(['wss://relay.a'])
  })

  it('addRemove()', () => {
    const store = createGraspServersStore()
    store.add('wss://relay.x/')
    store.add('wss://relay.x')
    store.add('http://invalid')
    let urls: string[] = []
    store.urls.subscribe((v: string[]) => (urls = v))()
    expect(urls).toEqual(['wss://relay.x'])
    store.remove('wss://relay.x/')
    store.urls.subscribe((v: string[]) => (urls = v))()
    expect(urls).toEqual([])
  })

  it('savePublishesReplacement() 30002', async () => {
    const store = createGraspServersStore()
    // no events loaded -> defaults to 30002
    store.add('wss://relay.one')
    const signed = await store.save(io, sign, 'pub')
    expect(signed.kind).toBe(30002)
    expect(signed.tags[0]).toEqual(['d','grasp-servers'])
    expect(signed.tags).toContainEqual(['relay','wss://relay.one'])
    expect(io.publishEvent).toHaveBeenCalled()
  })

  it('savePublishesReplacement() 10003', async () => {
    const store = createGraspServersStore()
    // force source to 10003 by loading that first
    const evt = makeEvt({ kind: 10003, created_at: 200, tags: [['r','wss://relay.b']], content: '' })
    ;(io.fetchEvents as any).mockResolvedValueOnce([]).mockResolvedValueOnce([evt])
    await store.load(io, 'pub')
    store.add('wss://relay.c')
    const signed = await store.save(io, sign, 'pub')
    expect(signed.kind).toBe(10003)
    expect(signed.tags).toContainEqual(['r','wss://relay.b'])
    expect(signed.tags).toContainEqual(['r','wss://relay.c'])
  })

  it('save error surfaced', async () => {
    const store = createGraspServersStore()
    store.add('wss://relay.err')
    ;(io.publishEvent as any).mockResolvedValue({ ok: false, error: 'boom' })
    await expect(store.save(io, sign, 'pub')).rejects.toThrow('boom')
  })
})
