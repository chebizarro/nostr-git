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
  import { useRegistry } from "../../useRegistry";
  import { fly } from "svelte/transition";
  const { Button, ProfileLink, Card } = useRegistry();

  interface Props {
    event: IssueEvent;
    comments?: CommentEvent[];
    status: StatusEvent | undefined;
    currentCommenter: string;
    onCommentCreated: (comment: CommentEvent) => Promise<void>;
  }
  // Accept event and optional author (Profile store)
  const { event, comments, status, currentCommenter, onCommentCreated }: Props = $props();

  const parsed = parseIssueEvent(event);

  const { id, subject: title, content: description, labels, createdAt } = parsed;

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
        return { icon: CircleDot, color: "text-gray-400" };
    }
  }

  function toggleExpand() {
    isExpanded = !isExpanded;
  }
</script>

<div transition:fly>
  <Card class="git-card hover:bg-accent/50 transition-colors">
    <div class="flex items-start gap-3">
      {#if statusIcon}
        {@const { icon: Icon, color } = statusIcon()}
        <Icon class={`h-6 w-6 mt-1 ${color}`} />
      {/if}
      <div class="flex-1">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <a href={`issues/${id}`}>
              <h3
                class="text-base font-semibold mb-0.5 leading-tight hover:text-accent transition-colors"
                title={title}
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
        <div class="flex items-center flex-wrap gap-2 text-sm text-muted-foreground mb-1">
          <span>Opened <TimeAgo date={createdAt} /></span>
          <span>• By <ProfileLink pubkey={event.pubkey} /> </span>
          <span>• {commentCount} comments</span>
        </div>
        <p class="my-3 line-clamp-2 text-sm text-muted-foreground">
          {description}
        </p>
        {#if labels && labels.length}
          <div class="mb-2 inline-flex gap-1">
            {#each labels as label}
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
