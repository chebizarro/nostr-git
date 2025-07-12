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
    Copy,
    GitCommit,
    Shield,
    User,
  } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Button, Card, ProfileComponent } = useRegistry();
  import { toast } from "$lib/stores/toast";
  import {
    GIT_STATUS_APPLIED,
    GIT_STATUS_CLOSED,
    GIT_STATUS_DRAFT,
    GIT_STATUS_OPEN,
    type PatchEvent,
    type StatusEvent,
    type CommentEvent,
  } from "@nostr-git/shared-types";
  import { parseGitPatchFromEvent } from "@nostr-git/core";
  import IssueThread from "./IssueThread.svelte";

  interface Props {
    event: PatchEvent;
    status?: StatusEvent;
    patches?: PatchEvent[];
    comments?: CommentEvent[];
    currentCommenter: string;
    onCommentCreated: (comment: CommentEvent) => Promise<void>;
  }

  const { event, status, patches, comments, currentCommenter, onCommentCreated }: Props = $props();

  const parsed = parseGitPatchFromEvent(event);

  const { id, title, description, baseBranch, commitCount } = parsed;

  let isExpanded = $state(false);
  let isBookmarked = $state(false);

  // Copy to clipboard function
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.push({
        message: `${label} copied to clipboard`,
        timeout: 2000
      })
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      toast.push({
        message: `Failed to copy ${label}`,
        timeout: 3000,
        theme: 'error'
      })
    }
  }

  const statusIcon = $derived(() => getStatusIcon(status?.kind));

  function getStatusIcon(kind: number | undefined) {
    switch (kind) {
      case GIT_STATUS_OPEN:
        return { icon: GitPullRequest, color: "text-amber-500" };
      case GIT_STATUS_APPLIED:
        return { icon: Check, color: "text-green-500" };
      case GIT_STATUS_CLOSED:
        return { icon: X, color: "text-red-500" };
      case GIT_STATUS_DRAFT:
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

  function toggleExpand() {
    isExpanded = !isExpanded;
  }
</script>

<Card class="git-card hover:bg-accent/50 transition-colors">
  <div class="flex items-start gap-3">
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
        <span>Base: {baseBranch}</span>
        <span>•</span>
        <span>{commitCount + (patches?.length ?? 0)} commits</span>
        <span>•</span>
        <span>{comments?.length ?? 0} comments</span>
        {#if parsed.commitHash}
          <span>•</span>
          <div class="flex items-center gap-1">
            <GitCommit class="h-3 w-3" />
            <code class="text-xs font-mono">{parsed.commitHash.substring(0, 7)}</code>
            <button
              class="hover:text-foreground transition-colors"
              onclick={() => copyToClipboard(parsed.commitHash, 'Commit hash')}
            >
              <Copy class="h-3 w-3" />
            </button>
          </div>
        {/if}
        {#if event.tags?.find(t => t[0] === 'commit-pgp-sig')}
          <span>•</span>
          <div class="flex items-center gap-1 text-green-600">
            <Shield class="h-3 w-3" />
            <span class="text-xs">Signed</span>
          </div>
        {/if}
      </div>

      {#if isExpanded}
        <p class="text-sm text-muted-foreground mt-3">{description}</p>
        
        <!-- Enhanced metadata when expanded -->
        <div class="mt-3 p-3 bg-muted/30 rounded border text-xs">
          <div class="grid grid-cols-2 gap-2">
            {#if parsed.commitHash}
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">Commit:</span>
                <div class="flex items-center gap-1">
                  <code class="bg-background px-1 rounded font-mono">{parsed.commitHash.substring(0, 8)}</code>
                  <button
                    class="hover:text-foreground transition-colors"
                    onclick={() => copyToClipboard(parsed.commitHash, 'Commit hash')}
                  >
                    <Copy class="h-3 w-3" />
                  </button>
                </div>
              </div>
            {/if}
            
            {#if event.tags}
              {@const committerTag = event.tags.find(t => t[0] === 'committer')}
              {#if committerTag && committerTag[1] !== parsed.author.name}
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">Committer:</span>
                  <div class="flex items-center gap-1">
                    <User class="h-3 w-3" />
                    <span>{committerTag[1]}</span>
                  </div>
                </div>
              {/if}
              
              {@const recipients = event.tags.filter(t => t[0] === 'p')}
              {#if recipients.length > 0}
                <div class="col-span-2 flex items-center justify-between">
                  <span class="text-muted-foreground">Reviewers:</span>
                  <span>{recipients.length} tagged</span>
                </div>
              {/if}
            {/if}
            
            <!-- File statistics if available -->
            {#if parsed.diff && parsed.diff.length > 0}
              {@const lineStats = parsed.diff.reduce((acc, file) => {
                const content = file.content || ''
                const added = (content.match(/^\+/gm) || []).length
                const removed = (content.match(/^-/gm) || []).length
                return { added: acc.added + added, removed: acc.removed + removed }
              }, { added: 0, removed: 0 })}
              
              <div class="col-span-2 pt-2 border-t">
                <div class="flex items-center justify-between text-xs">
                  <span class="text-muted-foreground">Files:</span>
                  <div class="flex items-center gap-3">
                    <span class="flex items-center gap-1">
                      <FileCode class="h-3 w-3" />
                      {parsed.diff.length} changed
                    </span>
                    {#if lineStats.added > 0}
                      <span class="text-green-600">+{lineStats.added}</span>
                    {/if}
                    {#if lineStats.removed > 0}
                      <span class="text-red-600">-{lineStats.removed}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </div>
        
        <div class="mt-4 flex items-center justify-between">
          <Button size="sm" variant="outline">
            <a href={`patches/${id}`}>View Diff</a>
          </Button>
          <div class="flex items-center gap-1">
            <MessageSquare class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm text-muted-foreground">{comments?.length ?? 0}</span>
          </div>
        </div>
      {:else}
        <p class="text-sm text-muted-foreground mt-3 line-clamp-2">
          {description}
        </p>
        <div class="mt-4 flex items-center justify-between">
          <Button variant="outline" size="sm">
            <a href={`patches/${id}`}>View Diff</a>
          </Button>
          <div class="flex items-center gap-3">
            {#if event.tags?.find(t => t[0] === 'commit-pgp-sig')}
              <div class="flex items-center gap-1 text-green-600">
                <Shield class="h-3 w-3" />
                <span class="text-xs">Signed</span>
              </div>
            {/if}
            <div class="flex items-center gap-1">
              <MessageSquare class="h-4 w-4 text-muted-foreground" />
              <span class="text-sm text-muted-foreground">{comments?.length ?? 0}</span>
            </div>
          </div>
        </div>
      {/if}
    </div>
    <ProfileComponent pubkey={event.pubkey} hideDetails={true}></ProfileComponent>
  </div>
</Card>

{#if isExpanded}
<Card class="git-card transition-colors">
  <IssueThread
      issueId={id}
      issueKind={"1617"}
      comments={comments}
      currentCommenter={currentCommenter}
      onCommentCreated={onCommentCreated}
    />
  </Card>
{/if}
