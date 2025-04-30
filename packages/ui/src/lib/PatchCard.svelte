<script lang="ts">
  import {
    MessageSquare,
    BookmarkPlus,
    BookmarkCheck,
    ChevronDown,
    ChevronUp,
  } from "@lucide/svelte";
  import TimeAgo from "./TimeAgo.svelte";
  import { navigate } from "svelte-routing";
  import { useRegistry } from "./useRegistry";
  const { Avatar, AvatarFallback, AvatarImage, Button, Card } = useRegistry();
  import { toast } from "$lib/stores/toast";

  const {
    id,
    repoId,
    title,
    description,
    author,
    baseBranch,
    commitCount,
    commentCount,
    createdAt,
    status = "open",
  }: {
    id: string;
    repoId: string;
    title: string;
    description: string;
    author: { name: string; avatar: string };
    baseBranch: string;
    commitCount: number;
    commentCount: number;
    createdAt: string;
    status?: "open" | "merged" | "closed";
  } = $props();

  let isExpanded = $state(false);
  let isBookmarked = $state(false);

  const statusIcon = $derived(
    () =>
      ({
        open: `<svg class='h-6 w-6 text-amber-500'><use href='#GitPullRequest'/></svg>`,
        merged: `<svg class='h-6 w-6 text-green-500'><use href='#Check'/></svg>`,
        closed: `<svg class='h-6 w-6 text-red-500'><use href='#X'/></svg>`,
      })[status]
  );

  function toggleBookmark() {
    isBookmarked = !isBookmarked;
    toast.push({
      title: isBookmarked ? "Added to bookmarks" : "Removed from bookmarks",
      description: isBookmarked ? "Patch added to your threads" : "Patch removed from your threads",
    });
  }

  function viewDiff(e?: MouseEvent) {
    e?.preventDefault();
    navigate(`/git/repo/${repoId}/patches/${id}`);
  }
</script>

<Card class="bg-card text-card-foreground rounded-lg border shadow-sm p-4">
  <div class="flex items-start gap-3">
    {@html statusIcon()}
    <div class="flex-1">
      <div class="flex items-center justify-between mb-1">
        <a href={`/git/repo/${repoId}/patches/${id}`} class="block">
          <h3
            class="text-base font-semibold mb-0.5 leading-tight hover:text-accent transition-colors"
          >
            {title}
          </h3>
        </a>
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
        <span>Base: {baseBranch}</span>
        <span>•</span>
        <span>{commitCount} commits</span>
        <span>•</span>
        <span>{commentCount} comments</span>
      </div>
      <p class="text-xs text-muted-foreground mb-2">{description}</p>
      <div class="flex items-center gap-2">
        <Button
          size="sm"
          class="h-8 px-3 py-0 text-xs font-medium rounded-md border bg-background hover:bg-muted transition"
          onclick={viewDiff}
        >
          View Diff
        </Button>
        <Button
          size="sm"
          class="h-8 px-3 py-0 text-xs font-medium rounded-md border bg-background hover:bg-muted transition"
          onclick={toggleBookmark}
        >
          {isBookmarked ? "Bookmarked" : "Bookmark"}
        </Button>
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls="patch-description"
          class="ml-auto"
          style="border-color: hsl(var(--border))"
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

    <p
      id="patch-description"
      class={`text-sm mt-3 ${!isExpanded ? "line-clamp-2" : ""}`}
      style="color: hsl(var(--muted-foreground));"
    >
      {description}
    </p>

    <div class="mt-4 flex items-center justify-between">
      <Button variant="outline" size="sm" onclick={viewDiff}>View diff</Button>

      <div class="flex items-center gap-1">
        <MessageSquare class="h-4 w-4 " style="color: hsl(var(--muted-foreground));" />
        <span class="text-sm" style="color: hsl(var(--muted-foreground));">{commentCount}</span>
      </div>
    </div>
  </div>

  <Avatar
    class="h-8 w-8 rounded-full flex items-center justify-center font-medium bg-secondary text-secondary-foreground"
  >
    <AvatarImage src={author.avatar} alt={author.name} />
    <AvatarFallback>{author.name.slice(0, 2).toUpperCase()}</AvatarFallback>
  </Avatar>
</Card>
