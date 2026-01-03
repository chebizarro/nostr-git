// @nostr-git/flows: repoDAG.ts
// Build a Patch DAG from NIP-34 Patch events
import type { Event as NostrEvent } from "nostr-tools";
import type { PatchEvent } from "@nostr-git/events";

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

  // Distinguish forks by considering repo handle ('d') and first clone url in the key
  const byKey = new Map<string, PatchEvent[]>();
  for (const p of patches) {
    const commit = getTagValues(p, "commit")[0];
    if (!commit) continue;
    const d = getTagValues(p as any, "d")[0] || "";
    const clone = getTagValues(p as any, "clone")[0] || "";
    const key = `${commit}|${d}|${clone}`;
    const arr = byKey.get(key) ?? [];
    arr.push(p);
    byKey.set(key, arr);
  }

  const nodes: PatchNode[] = [];
  const roots: string[] = [];

  for (const [key, list] of byKey.entries()) {
    const commit = key.split("|")[0];
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