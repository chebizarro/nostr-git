<script lang="ts">
  import TimeAgo from "../../TimeAgo.svelte";
  import { CircleAlert, ChevronDown, ChevronUp, BookmarkPlus, BookmarkCheck } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Avatar, AvatarFallback, AvatarImage, Button } = useRegistry();
  import { toast } from "$lib/stores/toast";
  import type { CommentEvent, IssueEvent, Profile } from "@nostr-git/shared-types";
  import { parseIssueEvent } from "@nostr-git/shared-types";
  import IssueThread from "./IssueThread.svelte";

  // Accept event and optional author (Profile store)
  const {
    event,
    author,
    comments,
  }: {
    event: IssueEvent;
    author?: Profile;
    comments?: CommentEvent[];
  } = $props();
  const parsed = parseIssueEvent(event);
  const {
    id,
    subject: title,
    content: description,
    labels,
    createdAt,
    author: parsedAuthor,
  } = parsed;

  // Use $author store if available, fallback to parsedAuthor
  let displayAuthor = $state<Partial<Profile> & { pubkey?: string }>({});
  $effect(() => {
    const a = typeof author !== "undefined" ? $author : undefined;
    if (a) {
      displayAuthor.name = a.name;
      displayAuthor.display_name = a.display_name;
      displayAuthor.picture = a.picture;
      displayAuthor.pubkey = (a as any).pubkey ?? parsedAuthor?.pubkey;
    } else {
      displayAuthor.name = undefined;
      displayAuthor.display_name = undefined;
      displayAuthor.picture = undefined;
      displayAuthor.pubkey = parsedAuthor?.pubkey;
    }
  });

  // For commentCount and status, you may want to compute based on event.tags or extend the parser as needed.
  // Here, we'll default to 0 and 'open' for now:
  let commentCount = comments?.length ?? 0;
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
      <div class="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <span>Opened <TimeAgo date={createdAt} /></span>
        <span>•</span>
        <span
          >by {displayAuthor.display_name ||
            displayAuthor.name ||
            displayAuthor.pubkey ||
            "Unknown"}</span
        >
        <span>•</span>
        <span>{commentCount} comments</span>
      </div>
      <p class="text-xs text-muted-foreground mb-2">{@html description}</p>
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
    <Avatar
      class="h-8 w-8 rounded-full flex items-center justify-center font-medium bg-secondary text-secondary-foreground ml-3"
    >
      <AvatarImage
        src={displayAuthor.picture ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(displayAuthor.display_name || displayAuthor.name || displayAuthor.pubkey || "Unknown")}&background=random`}
        alt={displayAuthor.display_name || displayAuthor.name || displayAuthor.pubkey || "Unknown"}
      />
      <AvatarFallback
        >{(displayAuthor.display_name || displayAuthor.name || displayAuthor.pubkey || "U")
          .slice(0, 2)
          .toUpperCase()}</AvatarFallback
      >
    </Avatar>
  </div>
</div>
{#if isExpanded}
  <IssueThread issueId={id} comments={comments} />
{/if}
