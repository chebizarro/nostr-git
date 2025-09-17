// Core: status precedence resolver (separate from existing git status utilities)

import type { NostrEvent } from 'nostr-tools';

export type LocalStatusEvent = NostrEvent; // refine when wired to shared-types

// Status kind precedence: Draft < Open < Applied < Closed
// 1633 < 1630 < 1631 < 1632
function statusKindRank(kind: number): number {
  switch (kind) {
    case 1633: // draft
      return 0;
    case 1630: // open
      return 1;
    case 1631: // applied
      return 2;
    case 1632: // closed
      return 3;
    default:
      return -1; // unknown kinds rank lowest
  }
}

// Author role precedence: maintainer > rootAuthor > others
function authorRoleRank(pubkey: string, rootAuthor: string, maintainers: Set<string>): number {
  if (maintainers.has(pubkey)) return 2;
  if (pubkey === rootAuthor) return 1;
  return 0;
}

export function resolveStatus(args: {
  statuses: LocalStatusEvent[];
  rootAuthor: string;
  maintainers: Set<string>;
}): { final: LocalStatusEvent | undefined; reason: string } {
  const valid = args.statuses.filter(
    (e) => typeof e?.kind === 'number' && [1630, 1631, 1632, 1633].includes(e.kind)
  );
  if (valid.length === 0) return { final: undefined, reason: 'no-status-events' };

  let best: LocalStatusEvent | undefined;
  let bestRole = -1;
  let bestKind = -1;
  let bestTime = -1;

  for (const e of valid) {
    const role = authorRoleRank(e.pubkey, args.rootAuthor, args.maintainers);
    const kindR = statusKindRank(e.kind);
    const time = e.created_at ?? 0;

    if (
      role > bestRole ||
      (role === bestRole && kindR > bestKind) ||
      (role === bestRole && kindR === bestKind && time > bestTime)
    ) {
      best = e;
      bestRole = role;
      bestKind = kindR;
      bestTime = time;
    }
  }

  const roleLabel = bestRole === 2 ? 'maintainer' : bestRole === 1 ? 'root-author' : 'other';
  const kindLabel =
    best?.kind === 1632
      ? 'closed'
      : best?.kind === 1631
        ? 'applied'
        : best?.kind === 1630
          ? 'open'
          : 'draft';
  const reason = best
    ? `selected-by precedence: role=${roleLabel} (${bestRole}) > kind=${kindLabel} (${bestKind}) > recency(${bestTime})`
    : 'no-status-events';

  return { final: best, reason };
}
