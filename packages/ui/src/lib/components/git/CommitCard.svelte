<script lang="ts">
  import { formatDistanceToNow } from "date-fns";
  import { MessageSquare, Heart, Copy, Check, User } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  import NostrAvatar from "./NostrAvatar.svelte";
  const { Button, Card, CardContent, Textarea, Separator } = useRegistry();
  import BaseItemCard from "../BaseItemCard.svelte";

  // Real git commit data structure
  interface GitCommitData {
    oid: string;
    commit: {
      message: string;
      author: {
        name: string;
        email: string;
        timestamp: number;
      };
      committer: {
        name: string;
        email: string;
        timestamp: number;
      };
      parent: string[];
    };
  }

  interface CommitCardProps {
    commit: GitCommitData;
    onReact?: (commitId: string, type: "heart") => void;
    onComment?: (commitId: string, comment: string) => void;
    onNavigate?: (commitId: string) => void;
    href?: string; // Optional direct href for navigation
    // Optional avatar and display name supplied by app layer
    avatarUrl?: string;
    displayName?: string;
    pubkey?: string; // Optional Nostr pubkey for ProfileComponent avatar
    nip05?: string;
    nip39?: string;
  }

  let {
    commit,
    onReact,
    onComment,
    onNavigate,
    href,
    avatarUrl,
    displayName,
    pubkey,
    nip05,
    nip39,
  }: CommitCardProps = $props();

  let showComments = $state(false);
  let newComment = $state("");
  let copied = $state(false);

  function truncateHash(hash: string): string {
    return hash.substring(0, 7);
  }

  function formatDate(timestamp: number): string {
    return formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true });
  }

  function copyHash() {
    navigator.clipboard.writeText(commit.oid);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  function handleReact() {
    onReact?.(commit.oid, "heart");
  }

  function handleComment() {
    if (newComment.trim()) {
      onComment?.(commit.oid, newComment.trim());
      newComment = "";
      showComments = false;
    }
  }

  // Get initials for avatar fallback
  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  }

  // Build href fallback
  const computedHref = $derived(() => href || undefined);
</script>

<BaseItemCard clickable={true} href={computedHref()} variant="commit">
  <!-- title -->
  {#snippet slotTitle()}
    {commit.commit.message}
  {/snippet}

  <!-- meta row: author + time -->
  {#snippet slotMeta()}
    <span class="font-semibold text-sm truncate">{displayName || commit.commit.author.name}</span>
    <span class="text-xs text-muted-foreground whitespace-nowrap">• {formatDate(commit.commit.author.timestamp)}</span>
  {/snippet}

  <!-- actions: copy hash -->
  {#snippet slotActions()}
    <button
      onclick={copyHash}
      class="font-mono text-xs bg-muted px-2 py-1 rounded hover:bg-muted/80 transition-colors flex items-center gap-1"
      aria-label="Copy commit hash"
      title={commit.oid}
    >
      {truncateHash(commit.oid)}
      {#if copied}
        <Check class="h-3 w-3 text-green-500" />
      {:else}
        <Copy class="h-3 w-3" />
      {/if}
    </button>
  {/snippet}

  <!-- body: email (if present) -->
  {#if commit.commit.author.email}
    <div class="text-xs text-muted-foreground overflow-hidden">
      <span class="truncate" title={commit.commit.author.email}>{commit.commit.author.email}</span>
    </div>
  {/if}

  <!-- footer actions: react/comment and parent -->
  {#snippet slotFooter()}
    <div class="flex items-center justify-between w-full">
      <div class="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onclick={handleReact}
          class="h-8 px-2 text-muted-foreground hover:text-red-500 transition-colors"
        >
          <Heart class="h-4 w-4 mr-1" />
          <span class="text-xs">0</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onclick={() => (showComments = !showComments)}
          class="h-8 px-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageSquare class="h-4 w-4 mr-1" />
          <span class="text-xs">Comment</span>
        </Button>
      </div>

      {#if commit.commit.parent.length > 0}
        <div class="text-xs text-muted-foreground whitespace-nowrap">
          Parent: {truncateHash(commit.commit.parent[0])}
        </div>
      {/if}
    </div>
  {/snippet}

  <!-- right side avatar -->
  {#snippet slotSide()}
    <NostrAvatar
      pubkey={pubkey}
      avatarUrl={avatarUrl}
      nip05={nip05}
      nip39={nip39}
      email={commit.commit.author.email || commit.commit.committer?.email}
      displayName={displayName || commit.commit.author.name}
      size={40}
      class="h-10 w-10"
      title={displayName || commit.commit.author.name}
    />
  {/snippet}
</BaseItemCard>

{#if showComments}
  <Card class="git-card transition-colors mt-2">
    <CardContent class="p-4">
      <div class="space-y-3">
        <div class="flex gap-2">
          <div class="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
            <User class="h-3 w-3 text-muted-foreground" />
          </div>
          <div class="flex-1 space-y-2">
            <Textarea
              bind:value={newComment}
              placeholder="Add a comment about this commit..."
              class="min-h-[60px] resize-none text-sm"
            />
            <div class="flex justify-end gap-2">
              <Button variant="outline" size="sm" onclick={() => (showComments = false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onclick={handleComment}
                disabled={!newComment.trim()}
                class="bg-git hover:bg-git-hover"
              >
                Comment
              </Button>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
{/if}
