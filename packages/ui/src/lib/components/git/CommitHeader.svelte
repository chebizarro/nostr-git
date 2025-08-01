<script lang="ts">
  import { Copy, User, Calendar, GitCommit } from '@lucide/svelte';
  import { toast } from '../../stores/toast';

  interface Props {
    sha: string;
    author: string;
    email: string;
    date: number;
    message: string;
    parents: string[];
  }

  let { sha, author, email, date, message, parents }: Props = $props();

  // Format date for display
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'today';
    } else if (diffDays === 1) {
      return 'yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const formatExactDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Copy SHA to clipboard
  const copySha = async () => {
    try {
      await navigator.clipboard.writeText(sha);
      toast.push({ message: 'Commit SHA copied to clipboard' });
    } catch (err) {
      console.error('Failed to copy SHA:', err);
      toast.push({ message: 'Failed to copy SHA', theme: 'error' });
    }
  };

  // Extract commit title and body
  const commitLines = message.split('\n');
  const commitTitle = commitLines[0] || '';
  const commitBody = commitLines.slice(1).join('\n').trim();
</script>

<div class="border-b border-border bg-card">
  <div class="px-6 py-4">
    <!-- Commit Title -->
    <div class="mb-4">
      <h1 class="text-xl font-semibold text-foreground break-words">
        {commitTitle}
      </h1>
      {#if commitBody}
        <div class="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words">
          {commitBody}
        </div>
      {/if}
    </div>

    <!-- Commit Metadata -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <!-- Author Info -->
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <User class="h-4 w-4" />
          <span class="font-medium text-foreground">{author}</span>
          {#if email}
            <span class="text-muted-foreground">({email})</span>
          {/if}
        </div>

        <!-- Date Info -->
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar class="h-4 w-4" />
          <span title={formatExactDate(date)}>
            committed {formatDate(date)}
          </span>
        </div>

        <!-- Parent Commits -->
        {#if parents.length > 0}
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <GitCommit class="h-4 w-4" />
            <span>
              {parents.length === 1 ? 'parent' : 'parents'}:
              {#each parents as parent, i}
                <code class="mx-1 rounded bg-muted px-1 py-0.5 text-xs font-mono">
                  {parent.slice(0, 7)}
                </code>{#if i < parents.length - 1},{/if}
              {/each}
            </span>
          </div>
        {/if}
      </div>

      <!-- SHA and Copy Button -->
      <div class="flex items-center gap-2">
        <code class="rounded bg-muted px-2 py-1 text-sm font-mono text-foreground">
          {sha.slice(0, 7)}
        </code>
        <button
          onclick={copySha}
          class="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          title="Copy full SHA"
        >
          <Copy class="h-3 w-3" />
          Copy
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  /* Ensure long commit messages don't break layout */
  .break-words {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
</style>
