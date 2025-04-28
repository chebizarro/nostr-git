<script lang="ts">
    import { onMount } from 'svelte';
    import { MessageSquare } from 'lucide-svelte';
    import { formatDistanceToNow } from 'date-fns';
    import Avatar from '$lib/widgets/Avatar.svelte';
    import Button from '$lib/widgets/Button.svelte';
    import Textarea from '$lib/widgets/Textarea.svelte';
    import Card from '$lib/widgets/Card.svelte';
    import { toast } from '$lib/stores/toast';
  
export interface Comment {
  id: string;
  content: string;
  author: { name: string; avatar: string };
  createdAt: string;
}

const {
  issueId,
  comments = []
}: {
  issueId: string;
  comments?: Comment[];
} = $props();

let newComment = $state('');

function submit(event: Event) {
  event.preventDefault();
  if (!newComment.trim()) return;
  // TODO: send to backend
  toast.push({ title: 'Comment sent', description: 'Your comment was submitted.' });
  newComment = '';
}
</script>

  <Card class="mt-2 border-none shadow-none">
    <div class="space-y-4 p-4">
      {#each comments as c (c.id)}
        <div class="flex gap-3 group animate-fade-in">
          <Avatar size="sm" src={c.author.avatar} fallback={c.author.name.slice(0,2).toUpperCase()} />
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-sm">{c.author.name}</span>
              <span class="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
              </span>
            </div>
            <p class="text-sm mt-1 whitespace-pre-wrap">{c.content}</p>
          </div>
        </div>
      {/each}
  
      <form onsubmit={submit} class="flex gap-3 pt-4 border-t">
        <Avatar size="sm" fallback="ME" />
        <div class="flex-1 space-y-2">
          <Textarea bind:value={newComment}
                    placeholder="Write a comment..."
                    class="min-h-[80px] resize-none"/>
          <div class="flex justify-end">
            <Button type="submit" class="gap-2" disabled={!newComment.trim()}>
              <MessageSquare class="h-4 w-4" /> Comment
            </Button>
          </div>
        </div>
      </form>
    </div>
  </Card>
  