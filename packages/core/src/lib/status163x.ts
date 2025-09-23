// @nostr-git/core: status163x.ts
// Resolve latest effective 163x status with maintainer precedence

import type { NostrEvent } from "@nostr-git/shared-types";

export type StatusKind = 1630 | 1631 | 1632 | 1633;

function statusKindRank(kind: number): number {
  switch (kind) {
    case 1633:
      return 0; // draft
    case 1630:
      return 1; // open
    case 1631:
      return 2; // applied/merged
    case 1632:
      return 3; // closed
    default:
      return -1;
  }
}

function authorRoleRank(pubkey: string, rootAuthor: string, maintainers: Set<string>): number {
  if (maintainers.has(pubkey)) return 2;
  if (pubkey === rootAuthor) return 1;
  return 0;
}

export function resolveLatestStatusForRoot(params: {
  rootId: string;
  statuses: NostrEvent[];
  maintainers: Set<string>;
  rootAuthor: string;
}): NostrEvent | undefined {
  const valid = params.statuses.filter(
    (e) => typeof e?.kind === "number" && [1630, 1631, 1632, 1633].includes(e.kind)
  );
  if (valid.length === 0) return undefined;

  let best: NostrEvent | undefined;
  let bestRole = -1;
  let bestKind = -1;
  let bestTime = -1;

  for (const e of valid) {
    const role = authorRoleRank(e.pubkey, params.rootAuthor, params.maintainers);
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

  return best;
}
