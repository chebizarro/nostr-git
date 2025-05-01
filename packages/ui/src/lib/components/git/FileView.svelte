<script lang="ts">
  import { FileCode, Share, Download, Copy } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Button } = useRegistry();
  import { toast } from "$lib/stores/toast";

  const props = $props<{
    name: string;
    type?: "file" | "directory";
    path: string;
    content?: string;
  }>();

  const name = props.name;
  const type = props.type ?? "file";
  const path = props.path;
  const content = props.content ?? "";

  let isExpanded = $state(false);

  async function copyContent(event: MouseEvent | undefined) {
    event?.stopPropagation();
    try {
      await navigator.clipboard.writeText(content);
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

  function downloadFile(event: MouseEvent | undefined) {
    event?.stopPropagation();
    const blob = new Blob([content ?? ""], { type: "text/plain" });
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
    onclick={() => type === "file" && (isExpanded = !isExpanded)}
    aria-expanded={type === "file" ? isExpanded : undefined}
  >
    <div class="flex items-center">
      <FileCode class="h-4 w-4 mr-2 " style="color: hsl(var(--muted-foreground));" />
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

  {#if isExpanded && type === "file" && content}
    <div class="p-4 border-t" style="border-color: hsl(var(--border));">
      <pre class="bg-secondary/30 p-4 rounded-lg overflow-x-auto">
        <code>{content}</code>
      </pre>
    </div>
  {/if}
</div>
