<script lang="ts">
  import TimeAgo from "../../TimeAgo.svelte";
  import { CircleDot, ChevronDown, ChevronUp, BookmarkPlus, BookmarkCheck, CircleCheck } from "@lucide/svelte";
  import { toast } from "$lib/stores/toast";
  import type { CommentEvent, IssueEvent } from "@nostr-git/shared-types";
  import { getTagValue, parseIssueEvent } from "@nostr-git/shared-types";
  import IssueThread from "./IssueThread.svelte";
  import { useRegistry } from "../../useRegistry";

  const { Button, ProfileLink, Card } = useRegistry();

  interface Props {
    event: IssueEvent;
    comments?: CommentEvent[];
    currentCommenter: string;
    onCommentCreated: (comment: CommentEvent) => Promise<void>;
  }
  // Accept event and optional author (Profile store)
  const {
    event,
    comments,
    currentCommenter,
    onCommentCreated,
  }: Props = $props();

  $inspect(comments).with((type, comments) => {
    console.log('comments for all issues on the repo in nostr-git issuecard:', comments)
  })

  const parsed = parseIssueEvent(event);
  const {
    id,
    subject: title,
    content: description,
    labels,
    createdAt,
  } = parsed;

  const commentsOnThisIssue = $derived.by(() => {
    return comments?.filter((c) => getTagValue(c, 'E') === id)
  })

  let commentCount = $derived(commentsOnThisIssue?.length ?? 0)
  let status: "open" | "closed" | "resolved" = $state("open");
  if (event.tags.some((t) => t[0] === "t" && t[1] === "closed")) status = "closed";
  else if (event.tags.some((t) => t[0] === "t" && t[1] === "resolved")) status = "resolved";

  let isExpanded = $state(false);
  let isBookmarked = $state(false);

  function toggleBookmark() {
    isBookmarked = !isBookmarked;
    toast.push({
      title: isBookmarked ? "Added to bookmarks" : "Removed from bookmarks",
      description: isBookmarked ? "Issue added to your threads" : "Issue removed from your threads",
    });
  }

  function toggleExpand() {
    isExpanded = !isExpanded;
  }
</script>

<Card class="git-card hover:bg-accent/50 transition-colors">
  <div class="flex items-start gap-3">
    <div class="pt-2">
      {#if status === "open"}
        <CircleDot
          class={"h-5 w-5 mt-0.5 text-green-500"}
        />
      {:else if status === 'closed'}
        <CircleCheck class="h-5 w-5 mt-0.5 text-purple-500"/>
      {:else}
        <CircleCheck class="h-5 w-5 mt-0.5 text-green-500"/>
      {/if}
    </div>
    <div class="flex-1">
      <div class="flex items-center justify-between mb-1">
        <button
          type="button"
          class="flex-1 cursor-pointer text-left bg-transparent border-0 p-0"
          onclick={() => (isExpanded = !isExpanded)}
          aria-expanded={isExpanded}
          aria-controls="issue-thread"
        >
          <h3
            class="text-base font-semibold mb-0.5 leading-tight hover:text-accent transition-colors"
          >
            {title}
          </h3>
        </button>
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
        <span>• By <ProfileLink pubkey={event.pubkey}/> </span>
        <span>• {commentCount} comments</span>
      </div>
      <p class="text-sm text-muted-foreground mb-2">{@html description}</p>
      {#if labels && labels.length}
        <div class="inline-flex gap-1 mb-2">
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
          onclick={() => (isExpanded = !isExpanded)}
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
{#if isExpanded}
  <IssueThread
    issueId={id}
    issueKind={'1621'}
    comments={commentsOnThisIssue}
    currentCommenter={currentCommenter}
    onCommentCreated={onCommentCreated}
  />
{/if}
