import { describe, it, expect, vi } from 'vitest'
import * as mergeMod from '../src/lib/merge.js'

describe('analyzePatchMergeWithMetadata', () => {
  it('returns merge metadata event (clean) with proper tags', async () => {
    const spy = vi.spyOn(mergeMod, 'analyzePatchMerge').mockResolvedValue({
      canMerge: true,
      hasConflicts: false,
      conflictFiles: [],
      conflictDetails: [],
      upToDate: false,
      fastForward: false,
      patchCommits: ['c1'],
      analysis: 'clean',
      targetCommit: 'deadbeef',
      mergeBase: 'beadfeed',
    } as any)

    const repoAddr = '30617:owner:repo'
    const rootId = 'evt-root'
    const patch: any = { id: 'evt-patch', baseBranch: 'main', commits: [], raw: { content: '' } }
    const { analysis, mergeEvent, conflictEvent } = await mergeMod.analyzePatchMergeWithMetadata(
      'repo-1',
      repoAddr as any,
      rootId,
      patch,
      'main'
    )
    expect(analysis.canMerge).toBe(true)
    expect(mergeEvent.kind).toBe(30411)
    // #a and #e present
    const a = mergeEvent.tags.find((t: string[]) => t[0] === 'a')
    const e = mergeEvent.tags.find((t: string[]) => t[0] === 'e')
    expect(a?.[1]).toBe(repoAddr)
    expect(e?.[1]).toBe(rootId)
    expect(conflictEvent).toBeUndefined()

    spy.mockRestore()
  })

  it('returns conflict metadata event when analysis reports conflicts', async () => {
    const spy = vi.spyOn(mergeMod, 'analyzePatchMerge').mockResolvedValue({
      canMerge: false,
      hasConflicts: true,
      conflictFiles: ['src/x.ts'],
      conflictDetails: [{ file: 'src/x.ts', type: 'content', conflictMarkers: [] }],
      upToDate: false,
      fastForward: false,
      patchCommits: ['c1'],
      analysis: 'conflicts',
      targetCommit: 'cafebabe',
      mergeBase: 'beadfeed',
    } as any)

    const repoAddr = '30617:owner:repo'
    const rootId = 'evt-root-2'
    const patch: any = { id: 'evt-patch', baseBranch: 'main', commits: [], raw: { content: '' } }
    const { analysis, mergeEvent, conflictEvent } = await mergeMod.analyzePatchMergeWithMetadata(
      'repo-1',
      repoAddr as any,
      rootId,
      patch,
      'main'
    )
    expect(analysis.hasConflicts).toBe(true)
    expect(mergeEvent.kind).toBe(30411)
    expect(conflictEvent?.kind).toBe(30412)
    // #a and #e present in conflict event
    if (conflictEvent) {
      const a = conflictEvent.tags.find((t: string[]) => t[0] === 'a')
      const e = conflictEvent.tags.find((t: string[]) => t[0] === 'e')
      expect(a?.[1]).toBe(repoAddr)
      expect(e?.[1]).toBe(rootId)
    }

    spy.mockRestore()
  })
})
