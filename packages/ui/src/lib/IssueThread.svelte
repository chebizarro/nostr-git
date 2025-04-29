<script lang="ts">
  import { MessageSquare } from "@lucide/svelte";
  import { formatDistanceToNow } from "date-fns";
  import { Avatar, AvatarFallback, AvatarImage, Button } from "$lib/components";
  import { Textarea } from "$lib/components";
  import { Card } from "$lib/components";
  import { toast } from "$lib/stores/toast";

  export interface Comment {
    id: string;
    content: string;
    author: { name: string; avatar: string };
    createdAt: string;
  }

  const {
    issueId,
    comments = [],
  }: {
    issueId: string;
    comments?: Comment[];
  } = $props();

  let newComment = $state("");

  function submit(event: Event) {
    event.preventDefault();
    if (!newComment.trim()) return;
    // TODO: send to backend
    toast.push({
      title: "Comment sent",
      description: "Your comment was submitted.",
    });
    newComment = "";
  }
</script>

<Card class="mt-2 border-none shadow-none">
  <div class="space-y-4 p-4">
    {#each comments as c (c.id)}
      <div class="flex gap-3 group animate-fade-in">
        <Avatar class="h-8 w-8">
          <AvatarImage src={c.author.avatar} alt={c.author.name} />
          <AvatarFallback>{c.author.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <button class="font-semibold text-sm" onclick={() => console.log(c.author.name)}
              >{c.author.name}</button
            >
            <button
              class="text-xs text-muted-foreground"
              onclick={() =>
                console.log(formatDistanceToNow(new Date(c.createdAt), { addSuffix: true }))}
            >
              {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
            </button>
          </div>
          <p class="text-sm mt-1 whitespace-pre-wrap">{c.content}</p>
        </div>
      </div>
    {/each}

    <form onsubmit={submit} class="flex gap-3 pt-4 border-t">
      <Avatar class="h-8 w-8">
        <AvatarFallback>ME</AvatarFallback>
      </Avatar>
      <div class="flex-1 space-y-2">
        <Textarea
          bind:value={newComment}
          placeholder="Write a comment..."
          class="min-h-[80px] resize-none"
        />
        <div class="flex justify-end">
          <Button type="submit" class="gap-2" disabled={!newComment.trim()}>
            <MessageSquare class="h-4 w-4" /> Comment
          </Button>
        </div>
      </div>
    </form>
  </div>
</Card>
