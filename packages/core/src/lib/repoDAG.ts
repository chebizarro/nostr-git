// @nostr-git/core: repoDAG.ts
// Build a Patch DAG from NIP-34 Patch events

import type { NostrEvent } from "@nostr-git/shared-types";
import type { PatchEvent } from "@nostr-git/shared-types";

export interface PatchNode {
  id: string; // commit id
  parentIds: string[];
  isRoot: boolean;
  revisionRootId?: string;
}

function getTagValues(e: NostrEvent, name: string): string[] {
  return (e.tags as string[][]).filter((t) => t[0] === name).map((t) => t[1]);
}

function hasTag(e: NostrEvent, name: string, value: string): boolean {
  return (e.tags as string[][]).some((t) => t[0] === name && t[1] === value);
}

export function buildPatchDAG(events: NostrEvent[]): { nodes: PatchNode[]; roots: string[] } {
  const patches: PatchEvent[] = events.filter((e): e is PatchEvent => e.kind === 1617);

  const byCommit = new Map<string, PatchEvent[]>();
  for (const p of patches) {
    const commit = getTagValues(p, "commit")[0];
    if (!commit) continue;
    const arr = byCommit.get(commit) ?? [];
    arr.push(p);
    byCommit.set(commit, arr);
  }

  const nodes: PatchNode[] = [];
  const roots: string[] = [];

  for (const [commit, list] of byCommit.entries()) {
    const sorted = [...list].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
    const effective = sorted[sorted.length - 1];
    const parents = getTagValues(effective, "parent-commit");
    const isRoot = sorted.some((e) => hasTag(e, "t", "root")) || parents.length === 0;
    const isRevisionRoot = sorted.some((e) => hasTag(e, "t", "root-revision"));

    const node: PatchNode = {
      id: commit,
      parentIds: parents,
      isRoot,
      revisionRootId: isRevisionRoot ? commit : undefined,
    };

    nodes.push(node);
    if (isRoot) roots.push(commit);
  }

  return { nodes, roots };
}
