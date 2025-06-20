<script lang="ts">
  import TimeAgo from "../../TimeAgo.svelte";
  import { CircleAlert, ChevronDown, ChevronUp, BookmarkPlus, BookmarkCheck } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Avatar, AvatarImage, Button, Card } = useRegistry();
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
  } = parsed;

  // Use $author store if available, fallback to parsedAuthor
  let displayAuthor = $state<Partial<Profile> & { pubkey?: string }>({});
  $effect(() => {
    const a = typeof author !== "undefined" ? $author : undefined;
    if (a) {
      displayAuthor.name = a.name;
      displayAuthor.display_name = a.display_name;
      displayAuthor.picture = a.picture;
      displayAuthor.pubkey = (a as any).pubkey;
    } else {
      displayAuthor.name = undefined;
      displayAuthor.display_name = undefined;
      displayAuthor.picture = undefined;
      displayAuthor.pubkey = undefined;
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

<Card class="git-card hover:bg-accent/50 transition-colors">
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
      class="h-8 w-8"
    >
      <AvatarImage
        src={displayAuthor.picture}
        alt={displayAuthor.display_name || displayAuthor.name || displayAuthor.pubkey || "Unknown"}
      />
    </Avatar>
  </div>
</Card>
{#if isExpanded}
  <IssueThread issueId={id} comments={comments} />
{/if}
