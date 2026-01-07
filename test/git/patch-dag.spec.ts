import { describe, it, expect } from 'vitest';
import { buildPatchGraph } from '../../src/events/nip34/patch-graph.js';
import { buildPatchDAG } from '../../src/events/nip34/repo-dag.js';

function mkPatch(
  id: string,
  created_at: number,
  commit: string,
  parents: string[] = [],
  tags: string[][] = []
): any {
  return {
    id,
    kind: 1617,
    created_at,
    pubkey: 'npub1x',
    tags: [...parents.map((p) => ['parent-commit', p]), ['commit', commit], ...tags]
  };
}

describe('buildPatchGraph', () => {
  it('builds edges from parent-commit and folds revisions by created_at', () => {
    const p1v1 = mkPatch('e1', 10, 'c1', [], [['t', 'root']]);
    const p1v2 = mkPatch('e2', 20, 'c1'); // newer revision for c1
    const p2 = mkPatch('e3', 30, 'c2', ['c1']);

    const graph = buildPatchGraph([p1v1, p1v2, p2] as any);
    const n1 = graph.get('c1')!;
    const n2 = graph.get('c2')!;

    expect(n1.event.id).toBe('e2'); // latest revision retained
    expect(n1.isRoot).toBe(true);
    expect(n1.children).toContain('c2');
    expect(n2.parents).toContain('c1');
  });
});

describe('buildPatchDAG', () => {
  it('captures multi-parent merges (two parent-commit tags) and derives roots from parent count', () => {
    const A = mkPatch('a1', 1, 'A'); // no parents => root
    const B = mkPatch('b1', 2, 'B'); // no parents => root
    const M = mkPatch('m1', 3, 'M', ['A', 'B']); // merge commit with two parents

    const { nodes, roots } = buildPatchDAG([A, B, M] as any);

    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get('M')?.parents.slice().sort()).toEqual(['A', 'B']);

    // Roots are commits with no parents (or any t:root tag). Merge commit should not be a root.
    expect(roots.slice().sort()).toEqual(['A', 'B'].sort());
  });

  it('does not throw on cyclic parent relationships (current behavior: no traversal, no explicit cycle detection)', () => {
    const X = mkPatch('x1', 1, 'X', ['Y']);
    const Y = mkPatch('y1', 2, 'Y', ['X']);

    expect(() => buildPatchDAG([X, Y] as any)).not.toThrow();
    const { nodes, roots } = buildPatchDAG([X, Y] as any);

    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get('X')?.parents).toEqual(['Y']);
    expect(byId.get('Y')?.parents).toEqual(['X']);

    // Both have parents, so neither is a root under current rules.
    expect(roots).toEqual([]);
  });
});
