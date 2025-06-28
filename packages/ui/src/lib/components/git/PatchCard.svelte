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
      </div>

      {#if isExpanded}
        <p class="text-sm text-muted-foreground mt-3">{description}</p>
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
          <div class="flex items-center gap-1">
            <MessageSquare class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm text-muted-foreground">{comments?.length ?? 0}</span>
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
