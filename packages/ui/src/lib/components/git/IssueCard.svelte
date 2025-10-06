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
  import { fly } from "svelte/transition";
  import markdownit from "markdown-it";
  const { Button, ProfileLink, Card, EventActions } = useRegistry();

  const md = markdownit({
    html: true,
    linkify: true,
    typographer: true,
  });

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
  <Card class="git-card hover:bg-accent/50 transition-colors">
    <div class="flex items-start gap-3">
      <!-- Prefer canonical Status component when repo + events are provided -->
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
        {@const { icon: Icon, color } = statusIcon()}
        <Icon class={`h-6 w-6 mt-1 ${color}`} />
      {/if}
      <div class="flex-1">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <a href={`issues/${id}`}>
              <h3
                class="text-base font-semibold mb-0.5 leading-tight hover:text-accent transition-colors break-words"
              >
                {title || "No title"}
              </h3>
            </a>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class={isBookmarked ? "text-primary" : "text-muted-foreground"}
            onclick={toggleBookmark}
          >
            {#if isBookmarked}
              <BookmarkCheck class="h-4 w-4" />
            {:else}
              <BookmarkPlus class="h-4 w-4" />
            {/if}
          </Button>
        </div>
        <div class="flex items-center flex-wrap gap-2 text-sm text-muted-foreground mb-1 overflow-hidden">
          <span class="whitespace-nowrap">Opened <TimeAgo date={createdAt} /></span>
          <span class="whitespace-nowrap">• By <ProfileLink pubkey={event.pubkey} /> </span>
          <span class="whitespace-nowrap">• {commentCount} comments</span>
        </div>
        <div class="my-3 line-clamp-2 text-sm text-muted-foreground prose prose-sm max-w-none">
          {@html md.render(description || "")}
        </div>
        {#if displayLabels && displayLabels.length}
          <div class="mb-2 inline-flex gap-1">
            {#each displayLabels as label}
              <span class="rounded bg-muted px-2 py-0.5 text-xs">{label}</span>
            {/each}
          </div>
        {/if}
        <div class="flex items-center gap-2">
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-controls="issue-thread"
            class="ml-auto"
            onclick={toggleExpand}
          >
            {#if isExpanded}
              <ChevronUp class="h-5 w-5 text-muted-foreground" />
            {:else}
              <ChevronDown class="h-5 w-5 text-muted-foreground" />
            {/if}
          </button>
        </div>
      </div>
    </div>
  </Card>
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
