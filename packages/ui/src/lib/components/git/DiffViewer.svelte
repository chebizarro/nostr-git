<script lang="ts">
  import { MessageSquare, Loader2 } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Avatar, AvatarFallback, AvatarImage, Button, Textarea } = useRegistry();
  import { formatDistanceToNow } from "date-fns";
  import parseDiff from "parse-diff";
  import { ChevronDown, ChevronUp } from "@lucide/svelte";
  import { createCommentEvent, type CommentEvent, type CommentTag } from "@nostr-git/shared-types";
  import type { NostrEvent } from "nostr-tools";

  interface Comment {
    id: string;
    lineNumber: number;
    filePath?: string;
    content: string;
    author: {
      name: string;
      avatar: string;
    };
    createdAt: string;
  }

  // Use parse-diff File type
  type AnyFileChange = import("parse-diff").File;

  function getFileLabel(file: AnyFileChange): string {
    // parse-diff: file.from and file.to
    if (file.from && file.to && file.from !== file.to) {
      return `${file.from} → ${file.to}`;
    }
    return file.from || file.to || "unknown";
  }

  function getFileIsBinary(file: AnyFileChange): boolean {
    // parse-diff does not provide isBinary, so always return false for now
    return false;
  }

  const {
    diff = undefined,
    showLineNumbers = true,
    expandAll = false,
    comments = [],
    rootEvent,
    onComment,
    currentPubkey,
  }: {
    diff: AnyFileChange[] | string | undefined;
    showLineNumbers?: boolean;
    expandAll?: boolean;
    comments?: Comment[];
    rootEvent?: NostrEvent | { id: string; pubkey?: string; kind?: number };
    onComment?: (comment: Omit<CommentEvent, "id" | "pubkey" | "sig">) => Promise<void>;
    currentPubkey?: string | null;
  } = $props();

  let selectedLine = $state<number | null>(null);
  let selectedFileIdx = $state<number | null>(null);
  let selectedChunkIdx = $state<number | null>(null);
  let newComment = $state("");
  let expandedFiles = $state(new Set<string>());
  let isSubmitting = $state(false);

  // Accept both AST and raw string for dev ergonomics
  let parsed = $state<AnyFileChange[]>([]);
  $effect(() => {
    let initialExpanded = new Set<string>();
    if (typeof diff === "string") {
      try {
        parsed = parseDiff(diff);
      } catch (e) {
        parsed = [];
      }
    } else if (diff && Array.isArray(diff)) {
      // If diff is already the correct, fully-typed object
      parsed = diff;
    } else {
      parsed = [];
    }
    // Initially expand all files
    if (expandAll) {
      parsed.forEach((file) => initialExpanded.add(getFileLabel(file)));
    }
    expandedFiles = initialExpanded;
  });

  // Comments by file/hunk/line
  // Match comments based on actual line numbers from the change object and file path
  function getCommentsForLine(change: import("parse-diff").Change, filePath: string): Comment[] {
    // Extract the actual line number from the change based on its type
    // We use a single line number per change to ensure comments appear exactly once
    let lineNumberToMatch: number | null = null;
    
    if (change.type === "add") {
      // For added lines, use the new line number
      lineNumberToMatch = change.ln ?? null;
    } else if (change.type === "del") {
      // For deleted lines, use the old line number
      lineNumberToMatch = change.ln ?? null;
    } else if (change.type === "normal") {
      // For normal changes, use the new line number (ln2) since that's what
      // the user sees in the final file and what's stored when creating comments
      // (see submitComment which prefers ln2)
      lineNumberToMatch = change.ln2 ?? change.ln1 ?? null;
    }
    
    // Match comments that have this line number AND file path
    if (lineNumberToMatch === null) {
      return [];
    }
    
    return comments.filter((c) => {
      // Match line number
      if (c.lineNumber !== lineNumberToMatch) {
        return false;
      }
      // If comment has a filePath, it must match; if comment doesn't have filePath (legacy), allow it
      // This provides backward compatibility with old comments that don't have file paths
      if (c.filePath !== undefined && c.filePath !== "") {
        return c.filePath === filePath;
      }
      // Legacy comments without filePath are allowed (backward compatibility)
      return true;
    });
  }

  function toggleCommentBox(line: number, fileIdx: number, chunkIdx: number) {
    if (selectedLine === line && selectedFileIdx === fileIdx && selectedChunkIdx === chunkIdx) {
      selectedLine = null;
      selectedFileIdx = null;
      selectedChunkIdx = null;
    } else {
      selectedLine = line;
      selectedFileIdx = fileIdx;
      selectedChunkIdx = chunkIdx;
    }
    newComment = "";
  }

  async function submitComment(
    line: number,
    fileIdx: number,
    chunkIdx: number,
    filePath: string,
    lineNumber: number | null,
  ) {
    if (!newComment.trim() || !rootEvent || !onComment || !currentPubkey) {
      console.warn("[DiffViewer] Cannot submit comment: missing required props");
      return;
    }

    if (isSubmitting) return;

    isSubmitting = true;
    try {
      // Get the actual line number from the change
      const file = parsed[fileIdx];
      if (!file || !file.chunks) {
        throw new Error("Invalid file or chunk");
      }

      const chunk = file.chunks[chunkIdx];
      if (!chunk || !("changes" in chunk)) {
        throw new Error("Invalid chunk");
      }

      // Find the change at this line index
      const change = chunk.changes[line - 1];
      if (!change) {
        throw new Error("Invalid change");
      }

      // Determine the actual line number based on change type
      let actualLineNumber: number | null = null;
      if (change.type === "add") {
        actualLineNumber = (change as any).ln ?? null;
      } else if (change.type === "del") {
        actualLineNumber = (change as any).ln ?? null;
      } else if (change.type === "normal") {
        // For normal changes, prefer the new line number (ln2)
        actualLineNumber = (change as any).ln2 ?? (change as any).ln1 ?? null;
      }

      // Build comment content with context
      const commentContent = newComment.trim();
      const contextInfo = `File: ${filePath}${actualLineNumber !== null ? `\nLine: ${actualLineNumber}` : ""}`;
      const fullContent = `${commentContent}\n\n---\n${contextInfo}`;

      // No extra tags needed - file/line info is in content
      const extraTags: CommentTag[] = [];

      // Create NIP-22 comment event
      const commentEvent = createCommentEvent({
        content: fullContent,
        root: {
          type: "E",
          value: rootEvent.id,
          kind: rootEvent.kind?.toString() || "",
          pubkey: rootEvent.pubkey,
        },
        authorPubkey: currentPubkey,
        extraTags,
      });

      // Publish the comment
      await onComment(commentEvent);

      // Reset state
      selectedLine = null;
      selectedFileIdx = null;
      selectedChunkIdx = null;
      newComment = "";
    } catch (error) {
      console.error("[DiffViewer] Failed to submit comment:", error);
      // Optionally show error to user via toast or other UI feedback
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div
  class="git-diff-view border border-border rounded-md overflow-hidden"
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
      {#if isExpanded && file.chunks}
        <div id={`file-diff-${fileIdx}`}>
          {#each file.chunks as chunk, chunkIdx}
            <div class="mb-2">
              {#if "changes" in chunk}
                <div class="text-xs text-muted-foreground mb-1">{chunk.content}</div>
                {#each chunk.changes as change, i}
                  {@const ln = i + 1}
                  {@const currentFilePath = file.to || file.from || "unknown"}
                  {@const lineComments = getCommentsForLine(change, currentFilePath)}
                  {@const hasComments = lineComments.length > 0}
                  {@const isAdd = change.type === "add"}
                  {@const isDel = change.type === "del"}
                  {@const isNormal = change.type === "normal"}
                  {@const bgClass = isAdd
                    ? "git-diff-line-add bg-green-500/10"
                    : isDel
                      ? "git-diff-line-remove bg-red-500/10"
                      : "hover:bg-secondary/50"}

                  <div>
                    <div class={`flex group pl-2 pt-1 ${bgClass}`}>
                      <div class="flex shrink-0 text-muted-foreground select-none">
                        {#if showLineNumbers}
                          <span class="w-8 text-right pr-2">
                            {isDel ? (change.ln ?? "") : isNormal ? (change.ln1 ?? "") : ""}
                          </span>
                          <span class="w-8 text-right pr-2 border-r border-border mr-2">
                            {isAdd ? (change.ln ?? "") : isNormal ? (change.ln2 ?? "") : ""}
                          </span>
                        {/if}
                      </div>
                      <span class="font-mono whitespace-pre px-2 flex-1">{change.content}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                        onclick={() => toggleCommentBox(ln, fileIdx, chunkIdx)}
                      >
                        <MessageSquare class="h-4 w-4" />
                      </Button>
                    </div>

                    {#if hasComments}
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
                    {#if selectedLine === ln && selectedFileIdx === fileIdx && selectedChunkIdx === chunkIdx}
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
                              disabled={isSubmitting}
                            />
                            <div class="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onclick={() => {
                                  selectedLine = null;
                                  selectedFileIdx = null;
                                  selectedChunkIdx = null;
                                }}
                                disabled={isSubmitting}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                class="gap-1 bg-git hover:bg-git-hover"
                                disabled={!newComment.trim() || isSubmitting || !rootEvent || !onComment || !currentPubkey}
                                onclick={() => {
                                  const filePath = file.to || file.from || "unknown";
                                  const lineNum = isAdd ? (change.ln ?? null) : isNormal ? (change.ln2 ?? change.ln1 ?? null) : (change.ln ?? null);
                                  submitComment(ln, fileIdx, chunkIdx, filePath, lineNum);
                                }}
                              >
                                {#if isSubmitting}
                                  <Loader2 class="h-3.5 w-3.5 animate-spin" />
                                {:else}
                                  <MessageSquare class="h-3.5 w-3.5" />
                                {/if}
                                Comment
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
