<script lang="ts">
  import { MessageSquare } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Avatar, AvatarFallback, AvatarImage, Button, Textarea } = useRegistry();
  import { formatDistanceToNow } from "date-fns";
  import parseGitDiff from "parse-git-diff";
  import { ChevronDown, ChevronUp } from "@lucide/svelte";

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


  // Derive AnyFileChange from GitDiff as it's not directly exported in a way Storybook/Vite can consume
  type AnyFileChange = ReturnType<typeof parseGitDiff>["files"][number];

  function getFileLabel(file: AnyFileChange): string {
    if ("pathBefore" in file && "pathAfter" in file) {
      if (typeof file.pathBefore === "string" && typeof file.pathAfter === "string") {
        if (file.pathBefore !== file.pathAfter) {
          return `${file.pathBefore} → ${file.pathAfter}`;
        }
        return file.pathBefore;
      }
    }
    if ("path" in file && typeof file.path === "string") return file.path;
    return String(file.type);
  }

  function getFileIsBinary(file: AnyFileChange): boolean {
    return "isBinary" in file ? !!file.isBinary : false;
  }

  const {
    diff = undefined,
    showLineNumbers = true,
    expandAll = false,
    comments = [],
  }: {
    diff: AnyFileChange[] | string | undefined;
    showLineNumbers?: boolean;
    expandAll?: boolean;
    comments?: Comment[];
  } = $props();

  let selectedLine = $state<number | null>(null);
  let newComment = $state("");
  let expandedFiles = $state(new Set<string>());

  // Accept both AST and raw string for dev ergonomics
  let parsed = $state<AnyFileChange[]>([]);
  $effect(() => {
    let initialExpanded = new Set<string>();
    if (typeof diff === "string") {
      try {
        parsed = parseGitDiff(diff);
      } catch (e) {
        parsed = [];
      }
    } else if (
      diff &&
      Array.isArray(diff)
    ) {
      // If diff is already the correct, fully-typed object
      parsed = diff;
    } else {
      parsed = [];
    }
    // Initially expand all files
    if (expandAll) {
      parsed.forEach(file => initialExpanded.add(getFileLabel(file)));
    }
    expandedFiles = initialExpanded;
  });

  // Comments by file/hunk/line
  // TODO: Map comments by file/hunk/line for full AST support
  function getCommentsForLine(lineKey: string): Comment[] {
    // For now, fallback to lineNumber only (legacy)
    // In the future, use fileIdx/hunkIdx/ln for precise mapping
    const lineNum = Number(lineKey.split(":").pop());
    return comments.filter((c) => c.lineNumber === lineNum);
  }

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

<div
  class="border rounded-md p-4 overflow-x-auto font-mono text-sm bg-card"
  style="border-color: hsl(var(--border));"
>
  {#if parsed.length === 0}
    <div class="text-muted-foreground italic">No diff to display.</div>
  {/if}
  {#each parsed as file, fileIdx (getFileLabel(file))}
    {@const fileId = getFileLabel(file)}
    {@const isExpanded = expandedFiles.has(fileId)}
    <div class="mb-4">
      <button
        type="button"
        class="font-bold mb-1 flex items-center w-full text-left hover:bg-muted/50 p-1 rounded"
        onclick={() => {
          const newSet = new Set(expandedFiles);
          if (isExpanded) {
            newSet.delete(fileId);
          } else {
            newSet.add(fileId);
          }
          expandedFiles = newSet;
        }}
        aria-expanded={isExpanded}
        aria-controls={`file-diff-${fileIdx}`}
      >
        {#if isExpanded}
          <ChevronUp class="h-4 w-4 mr-2 shrink-0" />
        {:else}
          <ChevronDown class="h-4 w-4 mr-2 shrink-0" />
        {/if}
        <span class="truncate">{fileId}</span>
        {#if getFileIsBinary(file)}
          <span class="ml-2 text-xs text-orange-400 shrink-0">[binary]</span>
        {/if}
      </button>
      {#if isExpanded && "chunks" in file && file.chunks}
        <div id={`file-diff-${fileIdx}`}>
          {#each file.chunks as chunk, chunkIdx}
          <div class="mb-2">
            {#if "changes" in chunk}
              <div class="text-xs text-muted-foreground mb-1">{chunk.content}</div>
              {#each chunk.changes as change, i}
                {@const ln = i + 1}
                {@const lineKey = `${fileIdx}:${chunkIdx}:${ln}`}
                {@const lineComments = getCommentsForLine(lineKey)}
                {@const hasComments = lineComments.length > 0}
                {@const isMessageLine = change.type === "MessageLine"}
                {@const lineDisplayData = (() => {
                  if (isMessageLine) {
                    return { bgClass: "py-1 px-2 text-muted-foreground italic", contentClass: "" };
                  }

                  let bgClass = "py-1";
                  let contentClass = "pl-2"; // Default padding for content

                  if (change.type === "AddedLine") {
                    bgClass += " bg-green-950/30";
                    contentClass = "border-l-4 border-green-500 pl-2";
                  } else if (change.type === "DeletedLine") {
                    bgClass += " bg-red-950/30";
                    contentClass = "border-l-4 border-red-500 pl-2";
                  } else if (change.type === "UnchangedLine") {
                    bgClass += " hover:bg-secondary/50";
                  }
                  return { bgClass, contentClass };
                })()}

                <div>
                  {#if isMessageLine}
                    <div class="{lineDisplayData.bgClass}">{change.content}</div>
                  {:else}
                    <div class={`flex group ${lineDisplayData.bgClass}`}>
                      <div class="flex shrink-0 text-muted-foreground items-center">
                        {#if showLineNumbers}
                          <span class="w-8 select-none text-right pr-1">
                            {'lineBefore' in change && change.lineBefore !== undefined ? change.lineBefore : ''}
                          </span>
                          <span class="w-8 select-none text-right pr-2 border-r border-border mr-2">
                            {'lineAfter' in change && change.lineAfter !== undefined ? change.lineAfter : ''}
                          </span>
                        {/if}
                      </div>
                      <div class={`flex-1 ${lineDisplayData.contentClass}`}>
                        <span class="font-mono whitespace-pre">{change.content}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                        onclick={() => toggleCommentBox(ln)}
                      >
                        <MessageSquare class="h-4 w-4" />
                      </Button>
                    </div>
                  {/if}

                  {#if !isMessageLine && hasComments}
                    <div
                      class="bg-secondary/30 border-l-4 border-primary ml-10 pl-4 py-2 space-y-3"
                    >
                      {#each lineComments as c}
                        <div class="flex gap-2">
                          <Avatar class="h-8 w-8">
                            <AvatarImage src={c.author.avatar} alt={c.author.name} />
                            <AvatarFallback
                              >{c.author.name.slice(0, 2).toUpperCase()}</AvatarFallback
                            >
                          </Avatar>
                          <div class="flex-1">
                            <div class="flex items-center gap-2">
                              <span class="font-medium text-sm">{c.author.name}</span>
                              <span class="text-xs" style="color: hsl(var(--muted-foreground));">
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
                  {#if !isMessageLine && selectedLine === ln}
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
                            <Button
                              variant="outline"
                              size="sm"
                              onclick={() => (selectedLine = null)}>Cancel</Button
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
            {:else}
              <div class="text-xs text-muted-foreground italic">(Non-text chunk)</div>
            {/if}
          </div>
        {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>
