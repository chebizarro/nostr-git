<script lang="ts">
  import {
    MessageSquare,
    BookmarkPlus,
    BookmarkCheck,
    ChevronDown,
    ChevronUp,
    GitPullRequest,
    Check,
    X,
    FileCode,
    Copy,
    GitCommit,
    Shield,
    User,
  } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Button, Card, ProfileComponent, EventActions, ReactionSummary } = useRegistry();
  import { toast } from "../../stores/toast";
  import {
    GIT_STATUS_APPLIED,
    GIT_STATUS_CLOSED,
    GIT_STATUS_DRAFT,
    GIT_STATUS_OPEN,
    type PatchEvent,
    type StatusEvent,
    type CommentEvent,
  } from "@nostr-git/shared-types";
  import { parseGitPatchFromEvent } from "@nostr-git/core";
  import IssueThread from "./IssueThread.svelte";
  import Status from "./Status.svelte";
  import { getTagValue, getTags } from "@nostr-git/shared-types";
  import BaseItemCard from "../BaseItemCard.svelte";

  interface Props {
    event: PatchEvent;
    status?: StatusEvent;
    patches?: PatchEvent[];
    comments?: CommentEvent[];
    currentCommenter: string;
    onCommentCreated: (comment: CommentEvent) => Promise<void>;
    extraLabels?: string[];
    // Optional for Status.svelte integration
    repo?: any;
    statusEvents?: StatusEvent[];
    actorPubkey?: string;
    reviewersCount?: number; // new optional prop
  }

  const {
    event,
    status,
    patches,
    comments,
    currentCommenter,
    onCommentCreated,
    extraLabels = [],
    repo,
    statusEvents = [],
    actorPubkey,
    reviewersCount = 0, // default value
  }: Props = $props();

  const parsed = parseGitPatchFromEvent(event);

  const { id, title, description, baseBranch, commitCount } = parsed;
  
  // Helper functions for label normalization (matching centralized logic)
  function toNaturalLabel(label: string): string {
    if (typeof label !== "string") return ""
    const trimmed = label.trim()
    if (!trimmed) return ""
    const idx = trimmed.lastIndexOf("/")
    if (idx >= 0 && idx < trimmed.length - 1) {
      return trimmed.slice(idx + 1)
    }
    return trimmed.replace(/^#/, "")
  }

  function toStringSet(value: unknown): Set<string> {
    if (!value) return new Set<string>()
    if (value instanceof Set) {
      return new Set(Array.from(value).filter(v => typeof v === "string") as string[])
    }
    if (Array.isArray(value)) {
      return new Set(value.filter(v => typeof v === "string") as string[])
    }
    if (typeof value === "string") {
      return new Set([value])
    }
    return new Set<string>()
  }

  function normalizeEffectiveLabels(eff?: any | null): { flat: Set<string>; byNamespace: Record<string, Set<string>> } {
    const flat = toStringSet(eff?.flat)
    const byNamespace: Record<string, Set<string>> = {}
    
    if (eff && typeof eff.byNamespace === "object") {
      for (const ns of Object.keys(eff.byNamespace)) {
        byNamespace[ns] = toStringSet(eff.byNamespace[ns])
      }
    }
    
    return { flat, byNamespace }
  }

  function toNaturalArray(values?: Iterable<string> | null): string[] {
    if (!values) return []
    const out = new Set<string>()
    for (const val of values) {
      if (typeof val === "string") {
        out.add(toNaturalLabel(val))
      }
    }
    return Array.from(out)
  }

  function groupLabels(view: { flat: Set<string>; byNamespace: Record<string, Set<string>> }): {
    Status: string[]
    Type: string[]
    Area: string[]
    Tags: string[]
    Other: string[]
  } {
    const groupSets = {
      Status: new Set<string>(),
      Type: new Set<string>(),
      Area: new Set<string>(),
      Tags: new Set<string>(),
      Other: new Set<string>(),
    }

    const namespaceToGroup = (ns: string): keyof typeof groupSets => {
      if (ns === "org.nostr.git.status") return "Status"
      if (ns === "org.nostr.git.type") return "Type"
      if (ns === "org.nostr.git.area") return "Area"
      if (ns === "#t") return "Tags"
      return "Other"
    }

    for (const ns of Object.keys(view.byNamespace)) {
      const group = namespaceToGroup(ns)
      for (const val of view.byNamespace[ns]) {
        groupSets[group].add(toNaturalLabel(val))
      }
    }

    return {
      Status: Array.from(groupSets.Status),
      Type: Array.from(groupSets.Type),
      Area: Array.from(groupSets.Area),
      Tags: Array.from(groupSets.Tags),
      Other: Array.from(groupSets.Other),
    }
  }

  const displayLabels = $derived.by(() => {
    // Normalize the extraLabels (which come from the centralized label system)
    return toNaturalArray(extraLabels);
  });

  let isExpanded = $state(false);
  let isBookmarked = $state(false);

  const noun = "Patch";

  // Copy to clipboard function
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.push({
        message: `${label} copied to clipboard`,
        timeout: 2000,
      });
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      toast.push({
        message: `Failed to copy ${label}`,
        timeout: 3000,
        theme: "error",
      });
    }
  };

  const statusIcon = $derived(() => getStatusIcon(status?.kind));

  function getStatusIcon(kind: number | undefined) {
    switch (kind) {
      case GIT_STATUS_OPEN:
        return { icon: GitPullRequest, color: "text-amber-500" };
      case GIT_STATUS_APPLIED:
        return { icon: Check, color: "text-green-500" };
      case GIT_STATUS_CLOSED:
        return { icon: X, color: "text-red-500" };
      case GIT_STATUS_DRAFT:
        return { icon: FileCode, color: "text-gray-500" };
      default:
        return { icon: GitPullRequest, color: "text-gray-400" };
    }
  }

  function toggleBookmark() {
    isBookmarked = !isBookmarked;
    toast.push({
      title: isBookmarked ? "Added to bookmarks" : "Removed from bookmarks",
      description: isBookmarked ? "Patch added to your threads" : "Patch removed from your threads",
    });
  }

  function toggleExpand() {
    isExpanded = !isExpanded;
  }
</script>

<BaseItemCard clickable={true} href={`patches/${id}`} variant="patch">
  <!-- icon/status -->
  {#snippet slotIcon()}
    {#if repo && statusEvents}
      <Status
        repo={repo}
        rootId={id}
        rootKind={1617}
        rootAuthor={event.pubkey}
        statusEvents={statusEvents}
        actorPubkey={actorPubkey}
        compact={true} />
    {:else if statusIcon}
      {@const { icon: Icon, color } = statusIcon()}
      <Icon class={`h-6 w-6 ${color}`} />
    {/if}
  {/snippet}

  <!-- title -->
  {#snippet slotTitle()}
    {description}
  {/snippet}

  <!-- actions (bookmark + chevron) -->
  {#snippet slotActions()}
    <Button
      variant="ghost"
      size="icon"
      class={isBookmarked ? "text-primary" : "text-muted-foreground"}
      onclick={toggleBookmark}
      aria-label="Toggle bookmark"
    >
      {#if isBookmarked}
        <BookmarkCheck class="h-4 w-4" />
      {:else}
        <BookmarkPlus class="h-4 w-4" />
      {/if}
    </Button>
    <Button
      variant="ghost"
      size="icon"
      aria-expanded={isExpanded}
      aria-controls="patch-description"
      onclick={toggleExpand}
    >
      {#if isExpanded}
        <ChevronUp class="h-5 w-5 text-muted-foreground" />
      {:else}
        <ChevronDown class="h-5 w-5 text-muted-foreground" />
      {/if}
    </Button>
  {/snippet}

  <!-- meta row -->
  {#snippet slotMeta()}
    <span class="whitespace-nowrap">Base: <span class="max-w-[120px] inline-block truncate align-bottom" title={baseBranch}>{baseBranch}</span></span>
    <span>•</span>
    <span class="whitespace-nowrap">{commitCount + (patches?.length ?? 0)} commits</span>
    <span>•</span>
    <span class="whitespace-nowrap">{comments?.length ?? 0} comments</span>
    {#if reviewersCount > 0}
      <span>•</span>
      <span class="whitespace-nowrap">{reviewersCount} reviewer{reviewersCount === 1 ? "" : "s"}</span>
    {/if}
    {#if parsed.commitHash}
      <span>•</span>
      <div class="flex items-center gap-1 whitespace-nowrap">
        <GitCommit class="h-3 w-3" />
        <code class="text-xs font-mono">{parsed.commitHash.substring(0, 7)}</code>
        <button class="hover:text-foreground transition-colors" onclick={() => copyToClipboard(parsed.commitHash, "Commit hash")}>
          <Copy class="h-3 w-3" />
        </button>
      </div>
    {/if}
    {#if getTagValue(event as any, "commit-pgp-sig")}
      <span>•</span>
      <div class="flex items-center gap-1 text-green-600">
        <Shield class="h-3 w-3" />
        <span class="text-xs">Signed</span>
      </div>
    {/if}
  {/snippet}

  <!-- body content -->
  {#if isExpanded}
    <p class="text-sm text-muted-foreground mt-3">{description}</p>
    <div class="mt-3 p-3 bg-muted/30 rounded border text-xs">
      <div class="grid grid-cols-2 gap-2">
        {#if parsed.commitHash}
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Commit:</span>
            <div class="flex items-center gap-1">
              <code class="bg-background px-1 rounded font-mono">{parsed.commitHash.substring(0, 8)}</code>
              <button class="hover:text-foreground transition-colors" onclick={() => copyToClipboard(parsed.commitHash, "Commit hash")}>
                <Copy class="h-3 w-3" />
              </button>
            </div>
          </div>
        {/if}

        {#if event.tags}
          {@const committerName = getTagValue(event as any, "committer")}
          {#if committerName && committerName !== parsed.author.name}
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Committer:</span>
              <div class="flex items-center gap-1 min-w-0">
                <User class="h-3 w-3 flex-shrink-0" />
                <span class="truncate" title={committerName}>{committerName}</span>
              </div>
            </div>
          {/if}

          {@const recipients = getTags(event as any, "p")}
          {#if recipients.length > 0}
            <div class="col-span-2 flex items-center justify-between">
              <span class="text-muted-foreground">Reviewers:</span>
              <span>{recipients.length} tagged</span>
            </div>
          {/if}
        {/if}

        {#if parsed.diff && parsed.diff.length > 0}
          {@const lineStats = parsed.diff.reduce(
            (acc, file) => {
              const content = file.content || "";
              const added = (content.match(/^\+/gm) || []).length;
              const removed = (content.match(/^-/gm) || []).length;
              return { added: acc.added + added, removed: acc.removed + removed };
            },
            { added: 0, removed: 0 }
          )}

          <div class="col-span-2 pt-2 border-t">
            <div class="flex items-center justify-between text-xs">
              <span class="text-muted-foreground">Files:</span>
              <div class="flex items-center gap-3">
                <span class="flex items-center gap-1">
                  <FileCode class="h-3 w-3" />
                  {parsed.diff.length} changed
                </span>
                {#if lineStats.added > 0}
                  <span class="text-green-600">+{lineStats.added}</span>
                {/if}
                {#if lineStats.removed > 0}
                  <span class="text-red-600">-{lineStats.removed}</span>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <p class="text-sm text-muted-foreground mt-3 line-clamp-2">{description}</p>
  {/if}

  <!-- tags -->
  {#snippet slotTags()}
    {#if displayLabels && displayLabels.length}
      {#each displayLabels as label}
        <span class="rounded bg-muted px-2 py-0.5 text-xs">{label}</span>
      {/each}
    {/if}
  {/snippet}

  <!-- footer actions: reactions/actions and counts -->
  {#snippet slotFooter()}
    <div class="flex items-center gap-1">
      <ReactionSummary
        event={event}
        url={`patches/${id}`}
        reactionClass="tooltip-left"
        deleteReaction={() => {}}
        createReaction={() => {}}
        noTooltip={false}
        children={() => {}}
      />
      <EventActions event={event} url={`patches/${id}`} noun={noun} customActions={undefined} />
      <MessageSquare class="h-4 w-4 text-muted-foreground" />
      <span class="text-sm text-muted-foreground">{comments?.length ?? 0}</span>
      <Button size="sm" variant="outline" class="ml-2">
        <a href={`patches/${id}`}>View Diff</a>
      </Button>
    </div>
  {/snippet}

  <!-- right side (avatar/profile) -->
  {#snippet slotSide()}
    <ProfileComponent pubkey={event.pubkey} hideDetails={true} />
  {/snippet}
</BaseItemCard>

{#if isExpanded}
  <Card class="git-card transition-colors">
    <IssueThread
      issueId={id}
      issueKind={"1617"}
      comments={comments}
      currentCommenter={currentCommenter}
      onCommentCreated={onCommentCreated}
    />
  </Card>
{/if}
