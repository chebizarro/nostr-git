<script lang="ts">
  import TimeAgo from "../../TimeAgo.svelte";
  import {
    CircleDot,
    ChevronDown,
    ChevronUp,
    BookmarkPlus,
    BookmarkCheck,
    CircleCheck,
    FileCode,
  } from "@lucide/svelte";
  // @ts-ignore monorepo alias resolution may not map $lib in this package during isolated lints
  import { toast } from "$lib/stores/toast";
  import type { CommentEvent, IssueEvent, StatusEvent } from "@nostr-git/shared-types";
  import {
    getTagValue,
    GIT_STATUS_CLOSED,
    GIT_STATUS_OPEN,
    GIT_STATUS_APPLIED,
    parseIssueEvent,
    GIT_STATUS_DRAFT,
  } from "@nostr-git/shared-types";
  import IssueThread from "./IssueThread.svelte";
  import Status from "./Status.svelte";
  import { useRegistry } from "../../useRegistry";
  import NostrAvatar from "./NostrAvatar.svelte";
  import { fly } from "svelte/transition";
  import RichText from "../RichText.svelte";
  const { Button, ProfileLink, Card, EventActions } = useRegistry();
  import BaseItemCard from "../BaseItemCard.svelte";


  interface Props {
    event: IssueEvent;
    comments?: CommentEvent[];
    status?: StatusEvent | undefined;
    currentCommenter: string;
    onCommentCreated: (comment: CommentEvent) => Promise<void>;
    extraLabels?: string[];
    // Optional for Status.svelte integration
    repo?: any;
    statusEvents?: StatusEvent[];
    actorPubkey?: string;
    // When provided, NIP-19 codes in description are replaced by this URL template.
    // e.g. "https://njump.me/{raw}" or "/spaces/{type}/{id}"
    nip19LinkTemplate?: string;
  }
  // Accept event and optional author (Profile store)
  const {
    event,
    comments,
    status = undefined,
    currentCommenter,
    onCommentCreated,
    extraLabels = [],
    repo,
    statusEvents = [],
    actorPubkey,
    nip19LinkTemplate,
  }: Props = $props();

  const parsed = parseIssueEvent(event);

  const { id, subject: title, content: description, labels, createdAt } = parsed;
  const displayLabels = $derived.by(() =>
    Array.from(new Set([...(labels || []), ...(extraLabels || [])]))
  );

  const commentsOnThisIssue = $derived.by(() => {
    return comments?.filter((c) => getTagValue(c, "E") === id);
  });

  let commentCount = $derived(commentsOnThisIssue?.length ?? 0);

  let isExpanded = $state(false);
  let isBookmarked = $state(false);

  function toggleBookmark() {
    isBookmarked = !isBookmarked;
    toast.push({
      title: isBookmarked ? "Added to bookmarks" : "Removed from bookmarks",
      description: isBookmarked ? "Issue added to your threads" : "Issue removed from your threads",
    });
  }

  const statusIcon = $derived(() => getStatusIcon(status?.kind));

  function getStatusIcon(kind: number | undefined) {
    switch (kind) {
      case GIT_STATUS_OPEN:
        return { icon: CircleDot, color: "text-amber-500" };
      case GIT_STATUS_APPLIED:
        return { icon: CircleCheck, color: "text-green-500" };
      case GIT_STATUS_CLOSED:
        return { icon: CircleCheck, color: "text-red-500" };
      case GIT_STATUS_DRAFT:
        return { icon: FileCode, color: "text-gray-500" };
      default:
        return { icon: CircleDot, color: "text-amber-500" };
    }
  }

  function toggleExpand() {
    isExpanded = !isExpanded;
  }
</script>

<div transition:fly>
  <BaseItemCard clickable={true} href={`issues/${id}`} variant="issue">
    <!-- icon / status indicator -->
    {#snippet slotIcon()}
      {#if repo && statusEvents}
        <Status
          repo={repo}
          rootId={id}
          rootKind={1621}
          rootAuthor={event.pubkey}
          statusEvents={statusEvents}
          actorPubkey={actorPubkey}
          compact={true} />
      {:else if statusIcon}
        {@const { icon: IconCmp, color } = statusIcon()}
        <IconCmp class={`h-6 w-6 mt-1 ${color}`} />
      {/if}
    {/snippet}

    <!-- title -->
    {#snippet slotTitle()}
      {title || "No title"}
    {/snippet}

    <!-- actions (bookmark) -->
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
    {/snippet}

    <!-- meta row -->
    {#snippet slotMeta()}
      <span class="whitespace-nowrap">Opened <TimeAgo date={createdAt} /></span>
      <span class="whitespace-nowrap">• By <ProfileLink pubkey={event.pubkey} /> </span>
      <span class="whitespace-nowrap">• {commentCount} comments</span>
    {/snippet}

    <!-- body content -->
    <div class="line-clamp-2 prose prose-sm max-w-none">
      <RichText content={description || ""} prose={false} linkTemplate={nip19LinkTemplate ?? "https://njump.me/{raw}"} />
    </div>

    <!-- tags -->
    {#snippet slotTags()}
      {#if displayLabels && displayLabels.length}
        {#each displayLabels as label}
          <span class="rounded bg-muted px-2 py-0.5 text-xs">{label}</span>
        {/each}
      {/if}
    {/snippet}

    <!-- footer actions (expand) -->
    {#snippet slotFooter()}
      <div class="flex items-center gap-2">
        <EventActions event={event} url={`issues/${id}`} noun="issue" customActions={undefined} />
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls="issue-thread"
          onclick={toggleExpand}
        >
          {#if isExpanded}
            <ChevronUp class="h-5 w-5 text-muted-foreground" />
          {:else}
            <ChevronDown class="h-5 w-5 text-muted-foreground" />
          {/if}
        </button>
      </div>
    {/snippet}

    <!-- right side (avatar/profile) to match PatchCard -->
    {#snippet slotSide()}
      <NostrAvatar
        pubkey={event.pubkey}
        size={40}
        class="h-10 w-10"
        title={title || 'Issue author'}
      />
    {/snippet}
  </BaseItemCard>
</div>
{#if isExpanded}
  <Card class="git-card transition-colors">
    <IssueThread
      issueId={id}
      issueKind={"1621"}
      comments={commentsOnThisIssue}
      currentCommenter={currentCommenter}
      onCommentCreated={onCommentCreated}
    />
  </Card>
{/if}

<style>
  /* Ensure markdown content works with line-clamp */
  :global(.line-clamp-2 > *) {
    display: inline;
  }
  :global(.line-clamp-2 > p) {
    display: inline;
    margin: 0;
  }
  :global(.line-clamp-2 > ul),
  :global(.line-clamp-2 > ol) {
    display: inline;
    list-style: none;
    padding: 0;
    margin: 0;
  }
  :global(.line-clamp-2 > ul > li),
  :global(.line-clamp-2 > ol > li) {
    display: inline;
  }
  :global(.line-clamp-2 > ul > li::before),
  :global(.line-clamp-2 > ol > li::before) {
    content: "• ";
  }
</style>
