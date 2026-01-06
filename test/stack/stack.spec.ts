import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import {
  extractStackIdFromPatch,
  extractRevisionIdFromPatch,
  extractSupersedesFromPatch,
  extractDependsFromPatch,
  parseStackEvent,
  StackManager,
} from '../../src/stack/stack.js';

function makePatchEvent(tags: string[][]) {
  return { kind: 30602, tags } as any;
}

function makeStackEvent(extraTags: string[][] = []) {
  const base: string[][] = [
    ['a', 'repo:owner/name'],
    ['stack', 'stack-1'],
    ['member', 'm1'],
    ['member', 'm2'],
    ['order', 'm1', 'm2'],
  ];
  return { kind: 30410, tags: [...base, ...extraTags] } as any;
}

describe('stack utilities and manager', () => {
  it('extracts stack/rev/supersedes and depends from patch events', () => {
    const evt = makePatchEvent([
      ['stack', 's123'],
      ['rev', 'r9'],
      ['supersedes', 'old'],
      ['depends', 'a'],
      ['depends', 'b'],
    ]);
    expect(extractStackIdFromPatch(evt)).toBe('s123');
    expect(extractRevisionIdFromPatch(evt)).toBe('r9');
    expect(extractSupersedesFromPatch(evt)).toBe('old');
    expect(extractDependsFromPatch(evt)).toEqual(['a', 'b']);
  });

  it('parseStackEvent returns undefined for non-stack kind', () => {
    const notStack = { kind: 1, tags: [] } as any;
    expect(parseStackEvent(notStack)).toBeUndefined();
  });

  it('parseStackEvent maps repoAddr, id, members and order', () => {
    const evt = makeStackEvent();
    const d = parseStackEvent(evt)!;
    expect(d.id).toBe('stack-1');
    expect(d.repoAddr).toBe('repo:owner/name');
    expect(d.members.map(m => m.id)).toEqual(['m1', 'm2']);
    expect(d.order).toEqual(['m1', 'm2']);
    expect(d.raw).toBe(evt);
  });

  it('StackManager upsert/get stores by repoAddr:stackId', () => {
    const mgr = new StackManager();
    const evt = makeStackEvent();
    mgr.upsert(evt);
    const d = mgr.get('repo:owner/name', 'stack-1');
    expect(d?.id).toBe('stack-1');
    expect(d?.members.length).toBe(2);
  });
});
