import { describe, it, expect } from 'vitest';
import { buildPatchGraph } from '../src/lib/patchGraph.js';

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
