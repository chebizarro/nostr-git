<script lang="ts">
  import { Button } from "$lib/components";
  import { cn } from "$lib/utils";
  import { GitBranch, Star, Eye, GitFork } from "@lucide/svelte";
  import type { RepoAnnouncementEvent, Profile } from "@nostr-git/shared-types";
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
    <div class="flex items-center gap-2">
      <Button variant="outline" size="sm" class="gap-2">
        <Star class="h-4 w-4" />
        Star
      </Button>
      <Button variant="outline" size="sm" class="gap-2" onclick={watchRepo}>
        <Eye class="h-4 w-4" />
        {isRepoWatched ? "Unwatch" : "Watch"}
      </Button>
      <Button variant="outline" size="sm" class="gap-2">
        <GitFork class="h-4 w-4" />
        Fork
      </Button>
    </div>
  </div>
  <p class="text-muted-foreground mb-4">{description}</p>

  <nav
    class={cn(
      "bg-muted text-muted-foreground inline-flex h-10 items-center justify-between rounded-md p-1 w-full"
    )}
  >
    <div class="grid grid-cols-6 w-full">
      {@render children?.(activeTab)}
    </div>
  </nav>
</div>
