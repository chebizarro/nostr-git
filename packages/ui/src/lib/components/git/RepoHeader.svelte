<script lang="ts">
  import { Button } from "$lib/components";
  import { cn } from "$lib/utils";
  import { GitBranch, Star, Eye, GitFork } from "@lucide/svelte";
  import type { RepoAnnouncementEvent } from "@nostr-git/shared-types";
  import { parseRepoAnnouncementEvent } from "@nostr-git/shared-types";

  // Accept props: event (NIP-34 RepoAnnouncementEvent), owner (Profile), activeTab
  const {
    event,
    activeTab = "overview",
    children,
    watchRepo,
    isRepoWatched,
  }: {
    event: RepoAnnouncementEvent;
    activeTab?: string;
    children?: any;
    watchRepo?: () => void;
    isRepoWatched: boolean;
  } = $props();
  const parsed = parseRepoAnnouncementEvent(event);
  const name = parsed.name ?? "";
  const description = parsed.description ?? "";
</script>

<div class="border-b border-border pb-4">
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-2xl font-bold flex items-center gap-2">
      <GitBranch class="h-6 w-6" />
      {name}
    </h1>
    <div class="flex items-center gap-1 sm:gap-2">
      <Button variant="outline" size="sm" class="gap-1 sm:gap-2 px-2 sm:px-3">
        <Star class="h-4 w-4" />
        <span class="hidden sm:inline">Star</span>
      </Button>
      <Button variant="outline" size="sm" class="gap-1 sm:gap-2 px-2 sm:px-3" onclick={watchRepo}>
        <Eye class="h-4 w-4" />
        <span class="hidden sm:inline">{isRepoWatched ? "Unwatch" : "Watch"}</span>
      </Button>
      <Button variant="outline" size="sm" class="gap-1 sm:gap-2 px-2 sm:px-3">
        <GitFork class="h-4 w-4" />
        <span class="hidden sm:inline">Fork</span>
      </Button>
    </div>
  </div>
  <p class="text-muted-foreground mb-4">{description}</p>

  <nav
    class={cn(
      "bg-muted text-muted-foreground rounded-md w-full"
    )}
  >
    <div class="flex overflow-x-auto scrollbar-hide">
      <div class="w-full flex justify-evenly gap-1 m-2 min-w-max">
        {@render children?.(activeTab)}
      </div>
    </div>
  </nav>
</div>

<style>
  /* Hide scrollbar for Chrome, Safari and Opera */
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  
  /* Hide scrollbar for IE, Edge and Firefox */
  .scrollbar-hide {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;  /* Firefox */
  }
</style>
