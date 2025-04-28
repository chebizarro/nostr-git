<script lang="ts">
import { formatDistanceToNow } from 'date-fns';
import {
  CircleAlert, MessageSquare, ChevronDown, ChevronUp,
  BookmarkPlus, BookmarkCheck
} from 'lucide-svelte';
import Avatar from '$lib/widgets/Avatar.svelte';
import Button from '$lib/widgets/Button.svelte';
import IssueThread from './IssueThread.svelte';
import { toast } from '$lib/stores/toast';

type Status = 'open' | 'closed' | 'resolved';

const {
  id,
  repoId,
  title,
  description,
  author,
  labels = [],
  commentCount,
  createdAt,
  status
}: {
  id: string;
  repoId: string;
  title: string;
  description: string;
  author: { name: string; avatar: string };
  labels?: string[];
  commentCount: number;
  createdAt: string;
  status: Status;
} = $props();

let isExpanded = $state(false);
let isBookmarked = $state(false);

const timeAgo = $derived(() => formatDistanceToNow(new Date(createdAt), { addSuffix: true }));

function toggleBookmark() {
  isBookmarked = !isBookmarked;
  toast.push({
    title: isBookmarked ? 'Added to bookmarks' : 'Removed from bookmarks',
    description: isBookmarked
      ? 'Issue added to your threads'
      : 'Issue removed from your threads'
  });
}

function toggleExpand() {
  isExpanded = !isExpanded;
}
</script>

  <div class="space-y-2">
    <div class="git-card hover:bg-accent/50 transition-colors">

      <div class="flex items-start gap-3">
        <CircleAlert class={`h-6 w-6 ${
          status === 'open' ? 'text-amber-500'
          : status === 'closed' ? 'text-red-500'
          : 'text-green-500' }`}
        />
  
        <div class="flex-1">
          <div class="flex items-center justify-between">
            <button type="button" class="flex-1 cursor-pointer text-left bg-transparent border-0 p-0" onclick={() => isExpanded = !isExpanded} aria-expanded={isExpanded} aria-controls="issue-thread">
              <h3 class="text-lg font-medium hover:text-accent transition-colors">
                {title}
              </h3>
            </div>
            <div class="flex items-center gap-2">
              <Button variant="ghost" size="icon"
                      class={isBookmarked ? 'text-primary' : 'text-muted-foreground'}
                      onclick={toggleBookmark}>
                {#if isBookmarked}
                  <BookmarkCheck class="h-4 w-4" />
                {:else}
                  <BookmarkPlus class="h-4 w-4" />
                {/if}
              </Button>
              {#if isExpanded}
                <ChevronUp  class="h-5 w-5 text-muted-foreground cursor-pointer"
                            onclick={() => isExpanded = false}/>
              {:else}
                <ChevronDown class="h-5 w-5 text-muted-foreground cursor-pointer"
                             onclick={() => isExpanded = true}/>
              {/if}
            </div>
          </div>
  
          <div class="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>#{id}</span><span>•</span><span>{status}</span><span>•</span>
            <span>{timeAgo} by {author.name}</span>
          </div>
  
          <p class="text-sm text-muted-foreground mt-3 line-clamp-2">{description}</p>
  
          <div class="mt-4 flex items-center justify-between">
            <div class="flex flex-wrap gap-2">
              {#each labels as label}
                <span class="git-tag bg-secondary">{label}</span>
              {/each}
            </div>
            <div class="flex items-center gap-1">
              <MessageSquare class="h-4 w-4 text-muted-foreground" />
              <span class="text-sm text-muted-foreground">{commentCount}</span>
            </div>
          </div>
        </div>
  
        <Avatar size="md" src={author.avatar} fallback={author.name.slice(0,2).toUpperCase()} />
      </div>
    </div>
  
    {#if isExpanded}
      <IssueThread {id} />
    {/if}