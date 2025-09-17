<script lang="ts">
  import { formatDistanceToNow } from "date-fns";
  import { MessageSquare, Heart, Share, MoreHorizontal, Copy, Check, User } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  import NostrAvatar from "./NostrAvatar.svelte";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "../ui/dropdown-menu";
  const { Button, Card, CardContent, Textarea, Separator } = useRegistry();

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

  // Handle commit card click for navigation
  function handleCommitClick(event: MouseEvent | KeyboardEvent) {
    event.preventDefault();

    if (href) {
      window.location.href = href;
    } else if (onNavigate) {
      onNavigate(commit.oid);
    }
  }
</script>

<Card class="group hover:bg-secondary/20 transition-colors">
  <CardContent class="p-4">
    <div class="flex items-start gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between mb-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-semibold text-sm">{displayName || commit.commit.author.name}</span>
              <span class="text-xs text-muted-foreground">
                {formatDate(commit.commit.author.timestamp)}
              </span>
            </div>

            <div class="flex items-center gap-2 mb-2">
              <button
                onclick={copyHash}
                class="font-mono text-sm bg-muted px-2 py-1 rounded hover:bg-muted/80 transition-colors flex items-center gap-1"
              >
                {truncateHash(commit.oid)}
                {#if copied}
                  <Check class="h-3 w-3 text-green-500" />
                {:else}
                  <Copy class="h-3 w-3" />
                {/if}
              </button>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="ghost" size="sm" class="h-8 w-8 p-0">
                <MoreHorizontal class="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onclick={copyHash}>
                <Copy class="h-4 w-4 mr-2" />
                Copy hash
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Share class="h-4 w-4 mr-2" />
                Share commit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div
          class="mb-3 cursor-pointer hover:bg-muted/30 -mx-2 px-2 py-1 rounded transition-colors"
          onclick={handleCommitClick}
          role="button"
          tabindex={0}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleCommitClick(e);
            }
          }}
        >
          <h3 class="font-medium text-sm leading-tight mb-1 truncate">
            {commit.commit.message}
          </h3>

          {#if commit.commit.author.email}
            <div class="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{commit.commit.author.email}</span>
            </div>
          {/if}
        </div>

        <div class="flex items-center justify-between">
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
            <div class="text-xs text-muted-foreground">
              Parent: {truncateHash(commit.commit.parent[0])}
            </div>
          {/if}
        </div>

        {#if showComments}
          <Separator class="my-3" />
          <div class="space-y-3">
            <div class="flex gap-2">
              <div
                class="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1"
              >
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
        {/if}
      </div>
      <div class="flex-shrink-0">
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
      </div>
    </div>
  </CardContent>
</Card>
