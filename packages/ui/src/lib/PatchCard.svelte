<script lang="ts">
  import {
    MessageSquare,
    BookmarkPlus,
    BookmarkCheck,
    ChevronDown,
    ChevronUp,
  } from "@lucide/svelte";
  import { formatDistanceToNow } from "date-fns";
  import { navigate } from "svelte-routing";
  import { Avatar, AvatarFallback, AvatarImage, Button, Card } from "$lib/components";
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

  const timeAgo = $derived(() => formatDistanceToNow(new Date(createdAt), { addSuffix: true }));

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

<Card class="git-card hover:bg-accent/50 transition-colors">
  <div class="flex items-start gap-3 p-4">
    {@html statusIcon}

    <div class="flex-1">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <a href={`/git/repo/${repoId}/patches/${id}`}>
            <h3 class="text-lg font-medium hover:text-accent transition-colors">
              {title}
            </h3>
          </a>
        </div>
        <div class="flex items-center gap-2">
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
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-controls="patch-description"
            class="p-0 m-0 bg-transparent border-0"
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

      <div class="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
        <span>#{id}</span><span>•</span>
        <span class="capitalize">{status}</span><span>•</span>
        <span
          >{commitCount} commit{commitCount !== 1 ? "s" : ""} to
          <code class="bg-secondary/50 px-1 rounded ml-1">{baseBranch}</code>
        </span><span>•</span>
        <span>{timeAgo} by {author.name}</span>
      </div>

      <p
        id="patch-description"
        class="text-sm text-muted-foreground mt-3 {isExpanded ? '' : 'line-clamp-2'}"
      >
        {description}
      </p>

      <div class="mt-4 flex items-center justify-between">
        <Button variant="outline" size="sm" onclick={viewDiff}>View diff</Button>

        <div class="flex items-center gap-1">
          <MessageSquare class="h-4 w-4 text-muted-foreground" />
          <span class="text-sm text-muted-foreground">{commentCount}</span>
        </div>
      </div>
    </div>

    <Avatar class="h-8 w-8">
      <AvatarImage src={author.avatar} alt={author.name} />
      <AvatarFallback>{author.name.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  </div>
</Card>
