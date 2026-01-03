<script lang="ts">
  import { nip19, type NostrEvent } from "nostr-tools";
  import { onMount } from "svelte";
  import {
    GitPullRequest,
    Copy,
    ChevronDown,
    ChevronUp,
    BookmarkPlus,
    BookmarkCheck,
    FileCode,
    Shield,
  } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";

  const { Card, Button, ProfileLink, Badge } = useRegistry();

  interface Props {
    event: NostrEvent;
  }

  let { event }: Props = $props();

  // Reactive state using Svelte 5 runes
  let patchTitle = $state("");
  let patchSubject = $state("");
  let authorNpub = $state("");
  let repoAddress = $state("");
  let commitHash = $state("");
  let targetBranch = $state("");
  let status = $state("open");
  let isExpanded = $state(false);
  let isBookmarked = $state(false);

  // Derived computed values
  const displayTitle = $derived(patchTitle || patchSubject || "Untitled Patch");
  const shortCommit = $derived(commitHash ? commitHash.slice(0, 8) : "");
  const patchContent = $derived(event.content || "");
  const createdDate = $derived(new Date(event.created_at * 1000));
  const isSigned = $derived(event.tags?.some((tag) => tag[0] === "commit-pgp-sig"));

  // Status color mapping
  const statusColors = $derived.by(() => {
    switch (status.toLowerCase()) {
      case "open":
        return { icon: GitPullRequest, color: "text-amber-500" };
      case "applied":
        return { icon: GitPullRequest, color: "text-green-500" };
      case "closed":
        return { icon: GitPullRequest, color: "text-red-500" };
      case "draft":
        return { icon: FileCode, color: "text-gray-500" };
      default:
        return { icon: GitPullRequest, color: "text-blue-500" };
    }
  });

  // Parse event tags to extract patch information
  const parseEventData = () => {
    const tags = event.tags || [];

    for (const tag of tags) {
      switch (tag[0]) {
        case "title":
          patchTitle = tag[1] || "";
          break;
        case "subject":
          patchSubject = tag[1] || "";
          break;
        case "a":
          repoAddress = tag[1] || "";
          break;
        case "commit":
          commitHash = tag[1] || "";
          break;
        case "branch":
          targetBranch = tag[1] || "";
          break;
        case "status":
          status = tag[1] || "open";
          break;
      }
    }

    // Generate npub from pubkey
    if (event.pubkey) {
      try {
        authorNpub = nip19.npubEncode(event.pubkey);
      } catch (error) {
        console.warn("Failed to encode npub:", error);
        authorNpub = event.pubkey.slice(0, 16) + "...";
      }
    }
  };

  // Effect to handle event updates
  $effect(() => {
    if (event) {
      parseEventData();
    }
  });

  // Handle copy to clipboard functionality
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const toggleExpand = () => {
    isExpanded = !isExpanded;
  };

  const toggleBookmark = () => {
    isBookmarked = !isBookmarked;
  };

  onMount(() => {
    parseEventData();
  });
</script>

<Card class="git-card hover:bg-accent/50 transition-colors">
  <div class="flex items-start gap-3">
    <statusColors.icon class={`h-6 w-6 mt-1 ${statusColors.color}`} />

    <div class="flex-1">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <a href={`patches/${event.id}`} class="block">
            <h3
              class="text-base font-semibold mb-0.5 leading-tight hover:text-accent transition-colors"
              title={displayTitle}
            >
              {displayTitle}
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
            class="ml-auto"
            onclick={toggleExpand}
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
        <span>By <ProfileLink pubkey={event.pubkey} /></span>
        <span>•</span>
        <span>{createdDate.toLocaleDateString()}</span>
        {#if targetBranch}
          <span>•</span>
          <span>→ {targetBranch}</span>
        {/if}
        {#if isSigned}
          <span>•</span>
          <div class="flex items-center gap-1 text-green-600">
            <Shield class="h-3 w-3" />
            <span>Signed</span>
          </div>
        {/if}
      </div>

      {#if !isExpanded}
        <p class="text-sm text-muted-foreground mb-3 line-clamp-2">
          {patchContent}
        </p>
      {:else}
        <div class="bg-muted/30 p-3 rounded border text-sm mb-3">
          <pre
            class="whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto font-mono text-xs leading-snug">{patchContent}</pre>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs mb-3">
          {#if commitHash}
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Commit:</span>
              <div class="flex items-center gap-1">
                <code class="bg-muted px-2 py-1 rounded font-mono">
                  {shortCommit}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-6 px-1"
                  onclick={() => copyToClipboard(commitHash)}
                  title="Copy commit hash"
                >
                  <Copy class="h-3 w-3" />
                </Button>
              </div>
            </div>
          {/if}

          {#if repoAddress}
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Repository:</span>
              <div class="flex items-center gap-1">
                <code class="bg-muted px-2 py-1 rounded font-mono text-xs">
                  {repoAddress.split("/").pop() || repoAddress}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-6 px-1"
                  onclick={() => copyToClipboard(repoAddress)}
                  title="Copy repository address"
                >
                  <Copy class="h-3 w-3" />
                </Button>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <div class="flex items-center justify-between">
        <div class="flex gap-2">
          <Button variant="outline" size="sm" class="h-8 px-3 py-0 text-xs">View Diff</Button>
          <span class={`text-xs px-2 py-1 rounded capitalize ${statusColors.color} bg-muted/50`}>
            {status}
          </span>
        </div>

        <div class="flex items-center gap-1 text-xs text-muted-foreground">
          <span>0 comments</span>
        </div>
      </div>
    </div>
  </div>
</Card>
