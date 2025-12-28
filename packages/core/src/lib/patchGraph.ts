// Core: Patch DAG builder using NIP-34 patch tags (commit / parent-commit)
import type { PatchEvent } from '@nostr-git/shared-types';

export type PatchNode = {
  // Node id is the commit hash for stable graph identity
  id: string; // commit hash
  event: PatchEvent; // effective (latest) event for this commit
  parents: string[]; // parent commit hashes from 'parent-commit' tags
  children: string[]; // child commit hashes
  isRoot: boolean; // no parents or tagged 't:root'
  isRevisionRoot: boolean; // tagged 't:root-revision'
  // Additional metadata
  commit: string;
  allEventIds: string[]; // all events observed for this commit
  supersededEventIds: string[]; // older events for same commit
};

function getTagValues(e: PatchEvent, name: string): string[] {
  return (e.tags as string[][]).filter((t) => t[0] === name).map((t) => t[1]);
}

function hasTag(e: PatchEvent, name: string, value: string): boolean {
  return (e.tags as string[][]).some((t) => t[0] === name && t[1] === value);
}

export function buildPatchGraph(patches: PatchEvent[]): Map<string, PatchNode> {
  // Group events by their commit hash
  const byCommit = new Map<string, PatchEvent[]>();
  for (const p of patches) {
    const commit = getTagValues(p, 'commit')[0];
    if (!commit) continue; // skip malformed patches lacking commit tag
    const arr = byCommit.get(commit) ?? [];
    arr.push(p);
    byCommit.set(commit, arr);
  }

  // Build nodes with revision folding: keep latest by created_at
  const nodes = new Map<string, PatchNode>();
  for (const [commit, events] of byCommit.entries()) {
    const sorted = [...events].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
    const allEventIds = sorted.map((e) => (e as any).id as string).filter(Boolean);
    const effective = sorted[sorted.length - 1];
    const supersededEventIds = allEventIds.slice(0, -1);

    const parents = getTagValues(effective, 'parent-commit');

    // Root flags should persist across revisions for a commit: if any revision tagged root/root-revision,
    // the node remains a root/root-revision even if the latest revision lacks the tag.
    const anyRoot = sorted.some((e) => hasTag(e, 't', 'root'));
    const anyRootRevision = sorted.some((e) => hasTag(e, 't', 'root-revision'));

    nodes.set(commit, {
      id: commit,
      event: effective,
      parents,
      children: [],
      isRoot: anyRoot,
      isRevisionRoot: anyRootRevision,
      commit,
      allEventIds,
      supersededEventIds
    });
  }

  // Link children by commit hash
  for (const n of nodes.values()) {
    for (const pCommit of n.parents) {
      const parent = nodes.get(pCommit);
      if (parent) parent.children.push(n.id);
    }
  }

  return nodes;
}
