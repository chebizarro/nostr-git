import { describe, it, expect } from 'vitest';
import { buildPatchGraph, type PatchNode } from '../src/events/nip34/patch-graph.js';

function patchEvt(partial: Partial<any>): any {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    kind: 1617,
    pubkey: 'p',
    content: partial.content ?? '',
    created_at: partial.created_at ?? 0,
    tags: partial.tags ?? [],
    sig: ''
  };
}

describe('buildPatchGraph', () => {
  it('builds DAG using commit and parent-commit, folding revisions by latest created_at', () => {
    // Two revisions for commit C1
    const C1v1 = patchEvt({ id: 'c1v1', created_at: 100, tags: [['commit', 'C1']] });
    const C1v2 = patchEvt({ id: 'c1v2', created_at: 200, tags: [['commit', 'C1']] });

    // Commit C2 with parent C1
    const C2 = patchEvt({
      id: 'c2',
      created_at: 150,
      tags: [
        ['commit', 'C2'],
        ['parent-commit', 'C1']
      ]
    });

    // Commit C3 root (no parent)
    const C3 = patchEvt({
      id: 'c3',
      created_at: 120,
      tags: [
        ['commit', 'C3'],
        ['t', 'root']
      ]
    });

    const graph = buildPatchGraph([C1v1, C1v2, C2, C3]);

    // Nodes by commit keys
    expect([...graph.keys()].sort()).toEqual(['C1', 'C2', 'C3']);

    const n1 = graph.get('C1') as PatchNode;
    const n2 = graph.get('C2') as PatchNode;
    const n3 = graph.get('C3') as PatchNode;

    // C1 effective event is v2
    expect(n1.event.id).toBe('c1v2');
    expect(n1.supersededEventIds).toEqual(['c1v1']);

    // Parent/child linking
    expect(n2.parents).toEqual(['C1']);
    expect(n1.children).toContain('C2');

    // Root detection
    expect(n3.isRoot).toBe(true);
    expect(n1.isRoot).toBe(false);

    // Sanity check children arrays
    expect(n2.children).toEqual([]);
  });

  it('links multi-parent merge commits (two parent-commit tags) to both parents', () => {
    const A = patchEvt({ id: 'a', created_at: 10, tags: [['commit', 'A'], ['t', 'root']] });
    const B = patchEvt({ id: 'b', created_at: 11, tags: [['commit', 'B'], ['t', 'root']] });

    const M = patchEvt({
      id: 'm',
      created_at: 20,
      tags: [
        ['commit', 'M'],
        ['parent-commit', 'A'],
        ['parent-commit', 'B']
      ]
    });

    const graph = buildPatchGraph([A, B, M]);

    const nA = graph.get('A')!;
    const nB = graph.get('B')!;
    const nM = graph.get('M')!;

    expect(nM.parents.slice().sort()).toEqual(['A', 'B']);
    expect(nA.children).toContain('M');
    expect(nB.children).toContain('M');

    // Ensure no duplicate child edge is introduced
    expect(nA.children.filter((c) => c === 'M')).toHaveLength(1);
    expect(nB.children.filter((c) => c === 'M')).toHaveLength(1);
  });

  it('does not throw when parent-commit references form a cycle (current behavior: no explicit cycle detection)', () => {
    const X = patchEvt({
      id: 'x',
      created_at: 1,
      tags: [
        ['commit', 'X'],
        ['parent-commit', 'Y']
      ]
    });

    const Y = patchEvt({
      id: 'y',
      created_at: 2,
      tags: [
        ['commit', 'Y'],
        ['parent-commit', 'X']
      ]
    });

    expect(() => buildPatchGraph([X, Y])).not.toThrow();

    const graph = buildPatchGraph([X, Y]);
    const nX = graph.get('X')!;
    const nY = graph.get('Y')!;

    expect(nX.parents).toEqual(['Y']);
    expect(nY.parents).toEqual(['X']);
    expect(nX.children).toContain('Y');
    expect(nY.children).toContain('X');

    // Neither is a root (each has a parent and no t:root tag)
    expect(nX.isRoot).toBe(false);
    expect(nY.isRoot).toBe(false);
  });

  it('skips malformed patches without commit tag', () => {
    const bad = patchEvt({ id: 'bad', created_at: 50, tags: [['parent-commit', 'X']] });
    const ok = patchEvt({ id: 'ok', created_at: 60, tags: [['commit', 'X']] });
    const graph = buildPatchGraph([bad, ok]);
    expect([...graph.keys()]).toEqual(['X']);
  });
});
