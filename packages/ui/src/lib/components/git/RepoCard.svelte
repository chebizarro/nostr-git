<script lang="ts">
  import TimeAgo from "../../TimeAgo.svelte";
  import { GitBranch, Star, BookOpen, Circle } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Avatar, Button, AvatarImage, AvatarFallback } = useRegistry();

  import type { RepoAnnouncementEvent, Profile } from "@nostr-git/shared-types";
  import { parseRepoAnnouncementEvent } from "@nostr-git/shared-types";
  // Accept event and optional owner (Profile)
  const {
    event,
    owner = {
      pubkey: "",
    },
    issueCount = 0,
    lastUpdated = undefined,
  }: {
    event: RepoAnnouncementEvent;
    owner?: Profile;
    issueCount?: number;
    lastUpdated?: string;
  } = $props();
  const parsed = parseRepoAnnouncementEvent(event);
  // Prefer owner for avatar/name if provided
  const repoOwner: Profile = { ...owner };
  const id = parsed.repoId;
  const name = parsed.name ?? "";
  const description = parsed.description ?? "";
  // Use event createdAt if lastUpdated not provided
  const updated = lastUpdated ?? parsed.createdAt;
</script>

<div class="bg-card text-card-foreground rounded-lg border shadow-sm p-4">
  <div class="flex items-start gap-3">
    <Avatar class="size-8 border bg-muted text-muted-foreground">
      <AvatarImage
        src={repoOwner.picture ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(repoOwner.display_name || repoOwner.name || "Unknown")}&background=random`}
        alt={repoOwner.display_name || repoOwner.name || "Unknown"}
      />
      <AvatarFallback
        >{(repoOwner.display_name || repoOwner.name || "U")
          .slice(0, 2)
          .toUpperCase()}</AvatarFallback
      >
    </Avatar>
    <div class="flex-1">
      <div class="flex items-center gap-1 mb-1">
        <Circle class="h-3 w-3 text-amber-500" />
        <span class="text-xs text-muted-foreground"
          >{repoOwner.display_name || repoOwner.name || "Unknown"}</span
        >
        <span class="text-xs text-muted-foreground"><TimeAgo date={updated} /></span>
      </div>
      <a href={`/git/repo/${id}`} class="block">
        <h3
          class="text-base font-semibold mb-0.5 leading-tight hover:text-accent transition-colors"
        >
          {name}
        </h3>
      </a>
      <p class="text-xs text-muted-foreground mb-2">{description}</p>
      <div class="flex flex-wrap gap-2">
        <Button
          href={`/git/repo/${id}/browse`}
          variant="outline"
          size="sm"
          class="h-8 px-3 py-0 text-xs font-medium rounded-md border bg-background hover:bg-muted transition"
        >
          <BookOpen class="h-4 w-4" /> Browse
        </Button>
        <Button
          href={`/git/repo/${id}/issues`}
          variant="outline"
          size="sm"
          class="h-8 px-3 py-0 text-xs font-medium rounded-md border bg-background hover:bg-muted transition text-git-issue"
        >
          Issues ({issueCount})
        </Button>
      </div>
    </div>
    <div class="flex flex-col gap-2 items-end ml-2">
      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8 p-0"
        onclick={() => console.log("Star button clicked")}><Star class="h-5 w-5" /></Button
      >
      <Button
        variant="ghost"
        size="icon"
        class="h-8 w-8 p-0"
        onclick={() => console.log("GitBranch button clicked")}
        ><GitBranch class="h-5 w-5" /></Button
      >
    </div>
  </div>
  <div class="border-t border-border mt-3 mb-2"></div>
  <div class="flex justify-between items-end gap-2 py-2">
    <div class="text-xs text-muted-foreground">
      <p class="font-semibold">{name}</p>
      <p>{description}</p>
    </div>
    <div class="flex flex-col items-end gap-1">
      <button
        class="text-xs text-muted-foreground hover:text-accent underline-offset-2 hover:underline"
        onclick={() => console.log("View on Web button clicked")}>View on Web</button
      >
      <div class="flex gap-4">
        <div class="flex flex-col items-start">
          <span class="text-xs font-medium">Recent Issues</span>
          <button
            class="text-xs text-muted-foreground hover:text-accent underline-offset-2 hover:underline"
            onclick={() => console.log("View Wiki button clicked")}>View Wiki</button
          >
        </div>
        <div class="flex flex-col items-end">
          <span class="text-xs font-medium">Recent Patches</span>
          <button
            class="text-xs text-muted-foreground hover:text-green-400 underline-offset-2 hover:underline"
            onclick={() => console.log("Join Live Coding Session button clicked")}
            >Join Live Coding Session</button
          >
        </div>
      </div>
    </div>
  </div>
</div>
