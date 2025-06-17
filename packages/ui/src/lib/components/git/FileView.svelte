<script lang="ts">
  import { FileCode, Folder, Share, Download, Copy } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Button } = useRegistry();
  import { toast } from "$lib/stores/toast";
  import type { FileEntry } from "@nostr-git/core";
  import Spinner from "../editor/Spinner.svelte";
  import CodeMirror from "svelte-codemirror-editor";

  const {
    file,
    getFileContent,
    setDirectory,
  }: {
    file: FileEntry;
    getFileContent: (path: string) => Promise<string>;
    setDirectory: (path: string) => void;
  } = $props();

  const name = file.name;
  const type = file.type ?? "file";
  const path = file.path;
  let content = $state("");

  let isExpanded = $state(false);

  $effect(() => {
    if (isExpanded) {
      if (type === "file") {
        getFileContent(path).then((c) => {
          content = c;
        });
      } else {
        content = "";
        setDirectory(path);
      }
    }
  });

  async function copyContent(event: MouseEvent | undefined) {
    event?.stopPropagation();
    try {
      if (!content) {
        content = await getFileContent(path);
      }
      navigator.clipboard.writeText(content);
      toast.push({
        title: "Copied to clipboard",
        description: `${name} content has been copied to your clipboard.`,
      });
    } catch {
      toast.push({
        title: "Failed to copy",
        description: "Could not copy the content to clipboard.",
        variant: "destructive",
      });
    }
  }

  async function downloadFile(event: MouseEvent | undefined) {
    event?.stopPropagation();
    if (!content) {
      content = await getFileContent(path);
    }
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function shareLink(event?: MouseEvent) {
    event?.stopPropagation();
    const shareUrl = `${location.origin}/git/repo/${path}`;
    navigator.clipboard.writeText(shareUrl);
    toast.push({
      title: "Link copied",
      description: "Permalink copied to clipboard.",
    });
  }
</script>

<div class="border" style="border-color: hsl(var(--border)); rounded-lg mb-2">
  <button
    type="button"
    class="flex items-center justify-between p-2 hover:bg-secondary/30 cursor-pointer w-full text-left"
    onclick={() => (isExpanded = !isExpanded)}
    aria-expanded={type === "file" ? isExpanded : undefined}
  >
    <div class="flex items-center">
      {#if type === "directory"}
        <Folder class="h-4 w-4 mr-2" style="color: hsl(var(--muted-foreground));" />
      {:else}
        <FileCode class="h-4 w-4 mr-2" style="color: hsl(var(--muted-foreground));" />
      {/if}
      <span>{name}</span>
    </div>
    {#if type === "file"}
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={shareLink}>
          <Share class="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={downloadFile}>
          <Download class="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={copyContent}>
          <Copy class="h-4 w-4" />
        </Button>
      </div>
    {/if}
  </button>

  {#if isExpanded && type === "file"}
    <div class="p-4 border-t" style="border-color: hsl(var(--border));">
      {#if content}
        <CodeMirror bind:value={content} />
      {:else}
        <Spinner>Fetching content...</Spinner>
      {/if}
    </div>
  {/if}
</div>
