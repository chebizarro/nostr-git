import type {
  NostrEvent,
  RepoStateEvent,
  CommentEvent,
  LabelEvent,
  StatusEvent,
  IssueEvent,
  PatchEvent,
  PullRequestEvent,
  PullRequestUpdateEvent,
  UserGraspListEvent,
} from "@nostr-git/shared-types";
import {
  canonicalRepoKey,
  parseEucTag,
  GitIssueStatus,
  parseRepoStateEvent,
} from "@nostr-git/shared-types";
import {
  assembleIssueThread,
  resolveIssueStatus,
  type IssueThread,
} from "./issues.js";
import { mergeRepoStateByMaintainers, type RefHeads } from "./repoState.js";
import {
  buildRepoSubscriptions,
  type RepoSubscriptions,
} from "./subscriptions.js";

// ============================================================
// Types Re-Exports
// ============================================================

export type RepoContext = {
  repoEvent?: NostrEvent;
  repoStateEvent?: RepoStateEvent;
  repo?: any; // generic metadata; core does not parse RepoAnnouncementEvent
  issues?: IssueEvent[];
  patches?: PatchEvent[];
  repoStateEventsArr?: RepoStateEvent[];
  statusEventsArr?: StatusEvent[];
  commentEventsArr?: CommentEvent[];
  labelEventsArr?: LabelEvent[];
  maintainers?: string[];
  pullRequests?: PullRequestEvent[];
  pullRequestUpdates?: PullRequestUpdateEvent[];
  userGraspLists?: UserGraspListEvent[];
};

// EffectiveLabelsV2 used for compatibility, simplified placeholder
export type EffectiveLabelsV2 = {
  byNamespace: Record<string, Set<string>>;
  flat: Set<string>;
  legacyT: Set<string>;
};

// ============================================================
// Helper Utilities
// ============================================================

function getOwnerPubkey(ctx: RepoContext): string {
  const owner = ctx.repo?.owner?.trim?.() ?? "";
  if (owner) return owner;
  return (ctx.repoEvent?.pubkey || "").trim();
}

function isTrusted(ctx: RepoContext, pubkey?: string): boolean {
  if (!pubkey) return false;
  const owner = getOwnerPubkey(ctx);
  if (pubkey === owner) return true;
  return (ctx.maintainers || ctx.repo?.maintainers || []).includes(pubkey);
}

function toLabelSet(arr: string[] | undefined): Set<string> {
  return new Set(arr || []);
}

// ============================================================
// RepoCore: Main Orchestrator
// ============================================================

export class RepoCore {
  // Repo identity helpers
  static getOwnerPubkey(ctx: RepoContext): string {
    return getOwnerPubkey(ctx);
  }

  static isTrusted(ctx: RepoContext, pubkey?: string): boolean {
    return isTrusted(ctx, pubkey);
  }

  static trustedMaintainers(ctx: RepoContext): string[] {
    const out = new Set<string>(ctx.repo?.maintainers || ctx.maintainers || []);
    const owner = getOwnerPubkey(ctx);
    if (owner) out.add(owner);
    return Array.from(out);
  }

  static mergeRepoStateByMaintainers(
    ctx: RepoContext,
    events: RepoStateEvent[]
  ): Map<string, { commitId: string; type: "heads" | "tags"; fullRef: string }> {
    const merged = new Map<
      string,
      { commitId: string; type: "heads" | "tags"; fullRef: string; at: number }
    >();
    for (const ev of events) {
      if (!isTrusted(ctx, ev.pubkey)) continue;
      const parsed = parseRepoStateEvent(ev) as any;
      const at = (ev as any).created_at || 0;
      let refs = parsed?.refs || [];
      // Fallback: reconstruct from legacy 'r' tags (pairs of ref/commit)
      if (!refs || refs.length === 0) {
        const tags: any[] = (ev as any).tags || [];
        let lastRef: string | null = null;
        const out: any[] = [];
        for (const t of tags) {
          if (t[0] !== "r") continue;
          if (t[2] === "ref") lastRef = t[1];
          else if (t[2] === "commit" && lastRef) {
            out.push({ ref: lastRef, commit: t[1] });
            lastRef = null;
          }
        }
        refs = out;
      }
      for (const ref of refs) {
        const fullRef: string =
          ref.ref ?? (ref.type && ref.name ? `refs/${ref.type}/${ref.name}` : "");
        if (!fullRef) continue;
        const m = /^refs\/(heads|tags)\/(.+)$/.exec(fullRef);
        if (!m) continue;
        const type = m[1] as "heads" | "tags";
        const name = m[2];
        const key = `${type}:${name}`;
        const prev = merged.get(key);
        const commitId: string = ref.commit || "";
        if (!prev || at > prev.at) {
          merged.set(key, { commitId, type, fullRef, at });
        }
      }
    }
    const out = new Map<string, { commitId: string; type: "heads" | "tags"; fullRef: string }>();
    for (const [k, v] of merged.entries())
      out.set(k, { commitId: v.commitId, type: v.type, fullRef: v.fullRef });
    return out;
  }

  static assembleIssueThread(args: {
    root: NostrEvent;
    comments: NostrEvent[];
    statuses: NostrEvent[];
  }): IssueThread {
    return assembleIssueThread(args);
  }

  static resolveIssueStatus(
    thread: IssueThread,
    rootAuthor: string,
    maintainers: Set<string>
  ): { final: NostrEvent | undefined; reason: string } {
    return resolveIssueStatus(thread, rootAuthor, maintainers);
  }

  // Patch graph generator
  static getPatchGraph(ctx: RepoContext): {
    nodes: Map<string, PatchEvent>;
    edgesCount: number;
    roots: string[];
    rootRevisions: string[];
    topParents: string[];
    parentOutDegree: Record<string, number>;
    parentChildren: Record<string, string[]>;
  } {
    const nodes = new Map<string, PatchEvent>();
    const edges = new Map<string, Set<string>>();
    const roots: string[] = [];
    const rootRevisions: string[] = [];
    const getTags = (evt: any, k: string) =>
      (evt.tags || []).filter((t: string[]) => t[0] === k);

    for (const p of ctx.patches || []) nodes.set(p.id, p);
    for (const p of ctx.patches || []) {
      const parents = [
        ...getTags(p, "e").map((t: string[]) => t[1]),
        ...getTags(p, "E").map((t: string[]) => t[1]),
      ];
      for (const par of parents) {
        if (!nodes.has(par)) continue;
        const set = edges.get(par) || new Set<string>();
        set.add(p.id);
        edges.set(par, set);
      }
      const tTags = getTags(p, "t").map((t: string[]) => t[1]);
      if (tTags.includes("root")) roots.push(p.id);
      if (tTags.includes("root-revision")) rootRevisions.push(p.id);
    }

    const edgesCount = Array.from(edges.values()).reduce(
      (acc, s) => acc + s.size,
      0
    );
    const topParents = Array.from(edges.entries())
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 10)
      .map(([id]) => id);
    const parentOutDegree: Record<string, number> = {};
    const parentChildren: Record<string, string[]> = {};
    for (const [pid, set] of edges.entries()) {
      parentOutDegree[pid] = set.size;
      parentChildren[pid] = Array.from(set);
    }

    return {
      nodes,
      edgesCount,
      roots: Array.from(new Set(roots)),
      rootRevisions: Array.from(new Set(rootRevisions)),
      topParents,
      parentOutDegree,
      parentChildren,
    };
  }

  // Issue / Patch threads & statuses
  static resolveStatusFor(
    ctx: RepoContext,
    rootId: string
  ): {
    state: "open" | "draft" | "closed" | "merged" | "resolved";
    by: string;
    at: number;
    eventId: string;
  } | null {
    const allStatus = ctx.statusEventsArr || [];
    if (allStatus.length === 0) return null;

    const rootAuthor = RepoCore.findRootAuthor(ctx, rootId);
    const rootIsIssue = !!(ctx.issues || []).find((i) => i.id === rootId);
    const kindToState = (
      kind: number
    ): "open" | "draft" | "closed" | "merged" | "resolved" => {
      if (kind === 1630) return "open";
      if (kind === 1633) return "draft";
      if (kind === 1632) return "closed";
      if (kind === 1631) return rootIsIssue ? "resolved" : "merged";
      return "open";
    };

    const events = allStatus
      .filter((ev) =>
        (ev.tags || []).some((t: string[]) => t[0] === "e" && t[1] === rootId)
      )
      .filter(
        (ev) =>
          isTrusted(ctx, ev.pubkey) || (!!rootAuthor && ev.pubkey === rootAuthor)
      )
      .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

    const last = events[events.length - 1];
    if (!last) return null;
    const state = kindToState((last as any).kind);
    return {
      state,
      by: last.pubkey,
      at: (last as any).created_at || 0,
      eventId: last.id,
    };
  }

  static findRootAuthor(ctx: RepoContext, rootId: string): string | undefined {
    const root =
      (ctx.issues || []).find((i) => i.id === rootId) ||
      (ctx.patches || []).find((p) => p.id === rootId);
    return root?.pubkey;
  }

  static getIssueThread(
    ctx: RepoContext,
    rootId: string
  ): { rootId: string; comments: CommentEvent[] } {
    const out: CommentEvent[] = [];
    if (!ctx.commentEventsArr)
      return { rootId, comments: out };

    for (const ev of ctx.commentEventsArr) {
      const tags = (ev.tags || []) as string[][];
      const hasE = tags.some((t) => (t[0] === "e" || t[0] === "E") && t[1] === rootId);
      if (hasE) out.push(ev);
    }

    return {
      rootId,
      comments: out.sort((a, b) => (a.created_at || 0) - (b.created_at || 0)),
    };
  }

  // Basic label integration (stubbed with simple structure)
  static getEffectiveLabelsFor(
    ctx: RepoContext,
    target: { id?: string; address?: string; euc?: string }
  ): EffectiveLabelsV2 {
    const legacyT = new Set<string>();
    const byNamespace: Record<string, Set<string>> = {};
    const flat = new Set<string>();
    const rootEvt =
      target.id
        ? ((ctx.issues || []).find((i) => i.id === target.id) ||
            (ctx.patches || []).find((p) => p.id === target.id))
        : undefined;
    if (rootEvt?.tags)
      for (const t of rootEvt.tags as any[][]) {
        if (t[0] === "t") {
          legacyT.add(t[1]);
          flat.add(t[1]);
        }
      }
    byNamespace["default"] = flat;
    return { byNamespace, flat, legacyT };
  }

  static getRepoLabels(ctx: RepoContext): EffectiveLabelsV2 {
    const address = ctx.repoEvent
      ? `${30617}:${getOwnerPubkey(ctx)}:${ctx.repo?.name || ""}`
      : "";
    return RepoCore.getEffectiveLabelsFor(ctx, { address });
  }

  static getIssueLabels(ctx: RepoContext, rootId: string): EffectiveLabelsV2 {
    return RepoCore.getEffectiveLabelsFor(ctx, { id: rootId });
  }

  static getPatchLabels(ctx: RepoContext, rootId: string): EffectiveLabelsV2 {
    return RepoCore.getEffectiveLabelsFor(ctx, { id: rootId });
  }

  static getMaintainerBadge(
    ctx: RepoContext,
    pubkey: string
  ): "owner" | "maintainer" | null {
    if (!pubkey) return null;
    const owner = getOwnerPubkey(ctx);
    if (pubkey === owner) return "owner";
    if ((ctx.repo?.maintainers || []).includes(pubkey)) return "maintainer";
    return null;
  }

  static getRecommendedFilters(ctx: RepoContext): any[] {
    const filters: any[] = [];
    const a = ctx.repoEvent
      ? `${30617}:${getOwnerPubkey(ctx)}:${ctx.repo?.name || ""}`
      : undefined;
    if (a)
      filters.push({
        kinds: [30617, 1617, 1618, 1619, 1621, 1630, 1631, 1632, 1633, 10317],
        "#a": [a],
      });

    const roots = [...(ctx.issues || []), ...(ctx.patches || [])].map(
      (e) => e.id
    );
    if (roots.length > 0) filters.push({ "#e": roots });

    const euc = (ctx.repoEvent?.tags || []).find(
      (t) => t[0] === "r" && t[2] === "euc"
    )?.[1];
    if (euc) filters.push({ "#r": [euc] });
    return filters;
  }

  // Subscriptions wrapper
  static buildRepoSubscriptions(args: {
    addressA?: string;
    rootEventId?: string;
    euc?: string;
  }): RepoSubscriptions {
    return buildRepoSubscriptions(args);
  }

  // Shared-types convenience
  static canonicalRepoKey(pubkey: string, name?: string): string {
    return canonicalRepoKey(pubkey, name);
  }

  static parseEucFromTags(tags: string[][]): string | undefined {
    return parseEucTag(tags);
  }

  // Convert Nostr issue final status to GitIssueStatus enum
  static summarizeIssueStatus(
    thread: IssueThread,
    rootAuthor: string,
    maintainers: Set<string>
  ): {
    status: GitIssueStatus;
    by?: string;
    at?: number;
    eventId?: string;
    reason: string;
  } {
    const { final, reason } = resolveIssueStatus(thread, rootAuthor, maintainers);
    const mapKindToEnum = (k?: number): GitIssueStatus => {
      switch (k) {
        case 1632:
          return GitIssueStatus.CLOSED;
        case 1631:
          return GitIssueStatus.RESOLVED;
        case 1630:
          return GitIssueStatus.OPEN;
        case 1633:
          return GitIssueStatus.DRAFT;
        default:
          return GitIssueStatus.OPEN;
      }
    };
    return {
      status: mapKindToEnum(final?.kind),
      by: final?.pubkey,
      at: final?.created_at,
      eventId: final?.id,
      reason,
    };
  }
}