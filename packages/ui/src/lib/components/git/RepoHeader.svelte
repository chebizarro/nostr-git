<script lang="ts">
  import { Button } from "$lib/components";
  import { cn } from "$lib/utils";
  import { GitBranch, Star, Eye, GitFork } from "@lucide/svelte";
  import type { RepoAnnouncementEvent, Profile } from "@nostr-git/shared-types";
  import { parseRepoAnnouncementEvent } from "@nostr-git/shared-types";

  // Accept props: event (NIP-34 RepoAnnouncementEvent), owner (Profile), activeTab
  const {
    event,
    owner = {},
    activeTab = "overview",
    children,
  }: {
    event: RepoAnnouncementEvent;
    owner?: Profile;
    activeTab?: string;
    children?: any;
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
      <Button variant="outline" size="sm" class="gap-2">
        <Eye class="h-4 w-4" />
        Watch
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
      "bg-muted text-muted-foreground inline-flex h-10 items-center justify-center rounded-md p-1"
    )}
  >
    <div class="grid grid-cols-6 mb-0">
      {@render children?.(activeTab)}
    </div>
  </nav>
</div>
