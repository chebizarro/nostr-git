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
  } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Avatar, AvatarFallback, AvatarImage, Button, Card } = useRegistry();
  import { toast } from "$lib/stores/toast";
  import type { PatchEvent, Profile, StatusEvent } from "@nostr-git/shared-types";
  import { parseGitPatchFromEvent } from "@nostr-git/core";

  // Accept event and optional owner (Profile)
  const {
    event,
    author,
    status,
  }: { event: PatchEvent; author?: import('svelte/store').Readable<Profile|undefined>; status?: StatusEvent } = $props();

  const parsed = parseGitPatchFromEvent(event);

  let displayAuthor = $state<Partial<Profile> & { pubkey?: string }>({});
  $effect(() => {
    const a = typeof author !== 'undefined' ? $author : undefined;
    if (a) {
      displayAuthor.name = a.name;
      displayAuthor.display_name = a.display_name;
      displayAuthor.picture = a.picture;
      displayAuthor.pubkey = (a as any).pubkey;
    }
  });

  const { id, title, description, baseBranch, commitCount, commentCount } = parsed;

  let isExpanded = $state(false);
  let isBookmarked = $state(false);

  const statusIcon = $derived(() => getStatusIcon(status?.kind));

  function getStatusIcon(kind: number | undefined) {
    switch (kind) {
      case 1630:
        return { icon: GitPullRequest, color: "text-amber-500" };
      case 1631:
        return { icon: Check, color: "text-green-500" };
      case 1632:
        return { icon: X, color: "text-red-500" };
      case 1633:
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

</script>

<Card class="git-card hover:bg-accent/50 transition-colors">
  <div class="flex items-start gap-3 p-4">
    {#if statusIcon}
      {@const { icon: Icon, color } = statusIcon()}
      <Icon class={`h-6 w-6 ${color}`} />
    {/if}
    <div class="flex-1">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <a href={`patches/${id}`} class="block">
            <h3
              class="text-lg font-medium hover:text-accent transition-colors truncate max-w-xs"
              title={title}
            >
              {description}
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
          <Button
            variant="ghost"
            size="icon"
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
          </Button>
        </div>
      </div>

      <div class="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <span>Base: {baseBranch}</span>
        <span>•</span>
        <span>{commitCount} commits</span>
        <span>•</span>
        <span>{commentCount} comments</span>
      </div>

      {#if isExpanded}
        <p class="text-sm text-muted-foreground mt-3">{description}</p>
        <div class="mt-4 flex items-center justify-between">
          <Button size="sm" variant="outline">
            <a href={`patches/${id}`}>View Diff</a>
          </Button>
          <div class="flex items-center gap-1">
            <MessageSquare class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm text-muted-foreground">{commentCount}</span>
          </div>
        </div>
      {:else}
        <p id="patch-description" class="text-sm text-muted-foreground mt-3 line-clamp-2">
          {description}
        </p>
        <div class="mt-4 flex items-center justify-between">
          <Button variant="outline" size="sm">
            <a href={`patches/${id}`}>View Diff</a>
          </Button>
          <div class="flex items-center gap-1">
            <MessageSquare class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm text-muted-foreground">{commentCount}</span>
          </div>
        </div>
      {/if}
    </div>
    <Avatar class="h-8 w-8">
      <AvatarImage src={displayAuthor.picture ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(displayAuthor.display_name || displayAuthor.name || displayAuthor.pubkey || 'Unknown')}&background=random`} alt={displayAuthor?.name ?? displayAuthor?.display_name ?? ""} />
    </Avatar>
  </div>
</Card>
