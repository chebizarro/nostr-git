<script lang="ts">
  import { MessageSquare } from "@lucide/svelte";
  import { useRegistry } from "./useRegistry";
  const { Avatar, AvatarFallback, AvatarImage, Button, Textarea } = useRegistry();
  import { formatDistanceToNow } from "date-fns";

  /** ——— Types ——— */
  interface Comment {
    id: string;
    lineNumber: number;
    content: string;
    author: {
      name: string;
      avatar: string;
    };
    createdAt: string;
  }

  const {
    diff,
    showLineNumbers = true,
    comments = [],
  }: {
    diff: string;
    showLineNumbers?: boolean;
    comments?: Comment[];
  } = $props();

  let selectedLine = $state<number | null>(null);
  let newComment = $state("");

  let lines: string[] = diff.split("\n");
  const commentsByLine = $derived(() =>
    comments.reduce(
      (acc, c) => {
        (acc[c.lineNumber] ??= []).push(c);
        return acc;
      },
      {} as Record<number, Comment[]>
    )
  );

  function toggleCommentBox(line: number) {
    selectedLine = selectedLine === line ? null : line;
    newComment = "";
  }

  function submitComment(line: number) {
    console.log(`New comment on line ${line}:`, newComment);
    selectedLine = null;
    newComment = "";
  }
</script>

<div class="border rounded-md p-4 overflow-x-auto font-mono text-sm bg-card" style="border-color: hsl(var(--border));">
  {#each lines as line, i}
    {@const ln = i + 1}
    {@const lineComments = commentsByLine[ln] ?? []}
    {@const hasComments = lineComments.length > 0}
    {@const lineClass =
      "py-1 pl-2" +
      (line.startsWith("+")
        ? " bg-green-950/30 border-l-4 border-green-500 pl-2"
        : line.startsWith("-")
          ? " bg-red-950/30 border-l-4 border-red-500 pl-2"
          : " hover:bg-secondary/50")}
    <div>
      <div class={`${lineClass} flex group`}>
        {#if showLineNumbers}
          <span
            class="inline-block w-10 select-none text-right pr-2 border-r" style="color: hsl(var(--muted-foreground)); border-color: hsl(var(--border));"
          >
            {ln}
          </span>
        {/if}
        <span class="font-mono whitespace-pre px-2 flex-1">{line}</span>
        <Button
          variant="ghost"
          size="icon"
          class="opacity-0 group-hover:opacity-100 transition-opacity"
          onclick={() => toggleCommentBox(ln)}
        >
          <MessageSquare class="h-4 w-4" />
        </Button>
      </div>
      {#if hasComments}
        <div class="bg-secondary/30 border-l-4 border-primary ml-10 pl-4 py-2 space-y-3">
          {#each lineComments as c}
            <div class="flex gap-2">
              <Avatar class="h-8 w-8">
                <AvatarImage src={c.author.avatar} alt={c.author.name} />
                <AvatarFallback>{c.author.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm">{c.author.name}</span>
                  <span class="text-xs " style="color: hsl(var(--muted-foreground));">
                    {formatDistanceToNow(new Date(c.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <p class="text-sm mt-1">{c.content}</p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if selectedLine === ln}
        <div class="bg-secondary/20 border-l-4 border-primary ml-10 pl-4 py-2">
          <div class="flex gap-2">
            <Avatar class="h-8 w-8">
              <AvatarFallback>ME</AvatarFallback>
            </Avatar>
            <div class="flex-1 space-y-2">
              <Textarea
                bind:value={newComment}
                placeholder="Add a comment..."
                class="min-h-[60px] resize-none"
              />
              <div class="flex justify-end gap-2">
                <Button variant="outline" size="sm" onclick={() => (selectedLine = null)}
                  >Cancel</Button
                >
                <Button
                  size="sm"
                  class="gap-1 bg-git hover:bg-git-hover"
                  disabled={!newComment.trim()}
                  onclick={() => submitComment(ln)}
                >
                  <MessageSquare class="h-3.5 w-3.5" /> Comment
                </Button>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/each}
</div>
