<script lang="ts">
  import TimeAgo from "./TimeAgo.svelte";
  import {
    CircleAlert,
    MessageSquare,
    ChevronDown,
    ChevronUp,
    BookmarkPlus,
    BookmarkCheck,
  } from "@lucide/svelte";
  import { useRegistry } from "./useRegistry";
  const { Avatar, AvatarFallback, AvatarImage, Button } = useRegistry();
  import IssueThread from "./IssueThread.svelte";
  import { toast } from "$lib/stores/toast";

  type Status = "open" | "closed" | "resolved";

  const {
    id,
    repoId,
    title,
    description,
    author,
    labels = [],
    commentCount,
    createdAt,
    status,
  }: {
    id: string;
    repoId: string;
    title: string;
    description: string;
    author: { name: string; avatar: string };
    labels?: string[];
    commentCount: number;
    createdAt: string;
    status: Status;
  } = $props();

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

<div class="bg-card text-card-foreground rounded-lg border shadow-sm p-4">
  <div class="flex items-start gap-3">
    <CircleAlert
      class={`h-5 w-5 mt-0.5 ${
        status === "open"
          ? "text-amber-500"
          : status === "closed"
            ? "text-red-500"
            : "text-green-500"
      }`}
    />
    <div class="flex-1">
      <div class="flex items-center justify-between mb-1">
        <button
          type="button"
          class="flex-1 cursor-pointer text-left bg-transparent border-0 p-0"
          onclick={() => (isExpanded = !isExpanded)}
          aria-expanded={isExpanded}
          aria-controls="issue-thread"
        >
          <h3 class="text-base font-semibold mb-0.5 leading-tight hover:text-accent transition-colors">
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
      <div class="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <span>Opened <TimeAgo date={createdAt} /></span>
        <span>•</span>
        <span>by {author.name}</span>
        <span>•</span>
        <span>{commentCount} comments</span>
      </div>
      <p class="text-xs text-muted-foreground mb-2">{description}</p>
      {#if labels && labels.length}
      <div class="inline-flex gap-1 mb-2">
        {#each labels as label}
          <span class="rounded bg-muted px-2 py-0.5 text-xs">{label}</span>
        {/each}
      </div>
      {/if}
      <div class="flex items-center gap-2">
        <button type="button" aria-expanded={isExpanded} aria-controls="issue-thread" class="ml-auto" onclick={() => (isExpanded = !isExpanded)}>
          {#if isExpanded}
            <ChevronUp class="h-5 w-5 text-muted-foreground" />
          {:else}
            <ChevronDown class="h-5 w-5 text-muted-foreground" />
          {/if}
        </button>
      </div>
    </div>
    <Avatar class="h-8 w-8 rounded-full flex items-center justify-center font-medium bg-secondary text-secondary-foreground ml-3">
      <AvatarImage src={author.avatar} alt={author.name} />
      <AvatarFallback>{author.name.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  </div>
</div>
{#if isExpanded}
  <IssueThread issueId={id} />
{/if}
