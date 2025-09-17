<script lang="ts">
  import { Plus, Minus, MessageSquarePlus } from "@lucide/svelte";

  interface Hunk {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    patches: Array<{ line: string; type: "+" | "-" | " " }>;
  }

  interface Props {
    hunks: Hunk[];
    filepath?: string;
  }

  let { hunks, filepath }: Props = $props();

  // Calculate line numbers for display
  const calculateLineNumbers = (hunk: Hunk) => {
    const lines: Array<{
      oldLineNum: number | null;
      newLineNum: number | null;
      content: string;
      type: "+" | "-" | " ";
    }> = [];

    let oldLineNum = hunk.oldStart;
    let newLineNum = hunk.newStart;

    for (const patch of hunk.patches) {
      if (patch.type === "+") {
        lines.push({
          oldLineNum: null,
          newLineNum: newLineNum,
          content: patch.line,
          type: patch.type,
        });
        newLineNum++;
      } else if (patch.type === "-") {
        lines.push({
          oldLineNum: oldLineNum,
          newLineNum: null,
          content: patch.line,
          type: patch.type,
        });
        oldLineNum++;
      } else {
        lines.push({
          oldLineNum: oldLineNum,
          newLineNum: newLineNum,
          content: patch.line,
          type: patch.type,
        });
        oldLineNum++;
        newLineNum++;
      }
    }

    return lines;
  };

  // Get line type styling
  const getLineClass = (type: "+" | "-" | " ") => {
    switch (type) {
      case "+":
        return "bg-green-50 border-l-2 border-l-green-500 text-green-900";
      case "-":
        return "bg-red-50 border-l-2 border-l-red-500 text-red-900";
      default:
        return "bg-background";
    }
  };

  // Get line number styling
  const getLineNumClass = (type: "+" | "-" | " ") => {
    switch (type) {
      case "+":
        return "bg-green-100 text-green-700";
      case "-":
        return "bg-red-100 text-red-700";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  // Handle add comment placeholder
  const handleAddComment = (lineNum: number) => {
    // Placeholder for future comment functionality
    console.log("Add comment at line:", lineNum);
  };
</script>

{#if hunks.length === 0}
  <div class="p-4 text-center text-muted-foreground">No changes to display</div>
{:else}
  <div class="overflow-hidden rounded-md border border-border">
    {#each hunks as hunk, hunkIndex}
      {@const lines = calculateLineNumbers(hunk)}

      <!-- Hunk Header -->
      <div
        class="bg-muted px-4 py-2 text-sm font-mono text-muted-foreground border-b border-border"
      >
        @@
        {#if hunk.oldLines > 0}
          -{hunk.oldStart},{hunk.oldLines}
        {:else}
          -{hunk.oldStart}
        {/if}
        {#if hunk.newLines > 0}
          +{hunk.newStart},{hunk.newLines}
        {:else}
          +{hunk.newStart}
        {/if}
        @@
        {#if filepath}
          <span class="ml-2 text-foreground">{filepath}</span>
        {/if}
      </div>

      <!-- Diff Lines -->
      <div class="divide-y divide-border">
        {#each lines as line, lineIndex}
          <div class="flex {getLineClass(line.type)}">
            <!-- Line Numbers -->
            <div class="flex shrink-0">
              <!-- Old Line Number -->
              <div
                class="w-12 px-2 py-1 text-right text-xs font-mono {getLineNumClass(
                  line.type
                )} border-r border-border"
              >
                {line.oldLineNum || ""}
              </div>
              <!-- New Line Number -->
              <div
                class="w-12 px-2 py-1 text-right text-xs font-mono {getLineNumClass(
                  line.type
                )} border-r border-border"
              >
                {line.newLineNum || ""}
              </div>
            </div>

            <!-- Change Indicator -->
            <div
              class="w-6 px-1 py-1 text-center text-xs font-mono {getLineNumClass(
                line.type
              )} border-r border-border"
            >
              {#if line.type === "+"}
                <Plus class="h-3 w-3 mx-auto text-green-600" />
              {:else if line.type === "-"}
                <Minus class="h-3 w-3 mx-auto text-red-600" />
              {:else}
                <span class="text-muted-foreground"> </span>
              {/if}
            </div>

            <!-- Line Content -->
            <div class="flex-1 px-2 py-1 font-mono text-sm overflow-x-auto">
              <pre class="whitespace-pre-wrap break-all">{line.content}</pre>
            </div>

            <!-- Add Comment Button (placeholder) -->
            <div class="w-8 px-1 py-1 opacity-0 hover:opacity-100 transition-opacity">
              <button
                onclick={() => handleAddComment(line.newLineNum || line.oldLineNum || 0)}
                class="w-6 h-6 rounded-sm bg-background border border-border hover:bg-muted flex items-center justify-center"
                title="Add comment"
              >
                <MessageSquarePlus class="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          </div>
        {/each}
      </div>

      <!-- Hunk Separator -->
      {#if hunkIndex < hunks.length - 1}
        <div class="h-2 bg-muted border-t border-border"></div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  /* Ensure code content doesn't break layout */
  pre {
    margin: 0;
    font-family:
      ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  }

  /* Custom scrollbar for horizontal overflow */
  .overflow-x-auto::-webkit-scrollbar {
    height: 6px;
  }

  .overflow-x-auto::-webkit-scrollbar-track {
    background: transparent;
  }

  .overflow-x-auto::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
  }

  .overflow-x-auto::-webkit-scrollbar-thumb:hover {
    background-color: rgba(0, 0, 0, 0.3);
  }
</style>
