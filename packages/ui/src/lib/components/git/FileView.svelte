<script lang="ts">
  import {
    FileCode,
    Folder,
    Share,
    Download,
    Copy,
    Info } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Button, Spinner } = useRegistry();
  import { toast } from "$lib/stores/toast";
  import type { FileEntry } from "@nostr-git/core";
  import CodeMirror from "svelte-codemirror-editor";
  import {
    detectFileType,
    getFileMetadata,
    type FileTypeInfo } from "../../utils/fileTypeDetection";
  import FileMetadataPanel from "./FileMetadataPanel.svelte";
  import {
    ImageViewer,
    PDFViewer,
    VideoViewer,
    AudioViewer,
    BinaryViewer }from "./viewers";
  
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
  let isMetadataPanelOpen = $state(false);
  let isLoading = $state(false);

  let fileTypeInfo = $state<FileTypeInfo | null>(null);
  let metadata = $state<Record<string, string>>({});
  
  $effect(() => {
    if (isExpanded && type === "file") {
      if (!content) {
        isLoading = true;
        getFileContent(path).then((c) => {
          content = c;
          isLoading = false;
          
          fileTypeInfo = detectFileType(name, c);
          metadata = getFileMetadata(file, c, fileTypeInfo);
        }).catch((error) => {
          toast.push({
            title: "Failed to load file content",
            description: error.message,
            variant: "destructive",
          });
          isLoading = false;
        });
      }
    } else if (isExpanded && type === "directory") {
      content = "";
      setDirectory(path);
    }
  });

  async function copyContent(event: MouseEvent | undefined) {
    event?.stopPropagation();
    try {
      if (!content) {
        content = await getFileContent(path);
      }
      
      if (fileTypeInfo?.category === 'binary') {
        toast.push({
          title: "Cannot copy binary file",
          description: "Binary files cannot be copied to clipboard. Use download instead.",
          variant: "destructive",
        });
        return;
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
    
    const mimeType = fileTypeInfo?.mimeType || "text/plain";
    const blob = new Blob([content], { type: mimeType });
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

  function showMetadata(event?: MouseEvent) {
    event?.stopPropagation();
    isMetadataPanelOpen = true;
  }

  function getFileIcon() {
    if (type === "directory") return Folder;
    if (fileTypeInfo?.icon) {
      const iconMap: Record<string, any> = {
        'Image': FileCode,
        'FileText': FileCode,
        'Settings': FileCode,
        'Container': FileCode,
        'Hammer': FileCode,
        'BookOpen': FileCode,
        'Scale': FileCode,
        'Braces': FileCode,
        'Code2': FileCode,
        'Terminal': FileCode,
        'Binary': FileCode,
        'Archive': FileCode,
        'Video': FileCode,
        'Music': FileCode,
      };
      return iconMap[fileTypeInfo.icon] || FileCode;
    }
    return FileCode;
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
        {@const IconComponent = getFileIcon()}
        <IconComponent class="h-4 w-4 mr-2" style="color: hsl(var(--muted-foreground));" />
      {/if}
      <span>{name}</span>
      {#if fileTypeInfo && type === "file"}
        <span class="ml-2 px-2 py-0.5 text-xs bg-muted/50 text-muted-foreground rounded">
          {fileTypeInfo.category}
        </span>
      {/if}
    </div>
    {#if type === "file"}
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={showMetadata}>
          <Info class="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={shareLink}>
          <Share class="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={downloadFile}>
          <Download class="h-4 w-4" />
        </Button>
        {#if fileTypeInfo?.canEdit !== false}
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={copyContent}>
            <Copy class="h-4 w-4" />
          </Button>
        {/if}
      </div>
    {/if}
  </button>

  {#if isExpanded && type === "file"}
    <div class="border-t" style="border-color: hsl(var(--border));">
      {#if isLoading}
        <div class="p-4">
          <Spinner>Fetching content...</Spinner>
        </div>
      {:else if content && fileTypeInfo}
        {#if fileTypeInfo.category === 'image'}
          <div class="p-4">
            <ImageViewer {content} filename={name} mimeType={fileTypeInfo.mimeType} />
          </div>
        {:else if fileTypeInfo.category === 'pdf'}
          <div class="p-4">
            <PDFViewer {content} filename={name} />
          </div>
        {:else if fileTypeInfo.category === 'video'}
          <div class="p-4">
            <VideoViewer {content} filename={name} mimeType={fileTypeInfo.mimeType} />
          </div>
        {:else if fileTypeInfo.category === 'audio'}
          <div class="p-4">
            <AudioViewer {content} filename={name} mimeType={fileTypeInfo.mimeType} />
          </div>
        {:else if fileTypeInfo.category === 'binary' || fileTypeInfo.category === 'archive'}
          <div class="p-4">
            <BinaryViewer {content} filename={name} />
          </div>
        {:else}
          <div class="p-4 border-t" style="border-color: hsl(var(--border));">
            <div class="mb-2 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-muted-foreground">Language:</span>
                <span class="text-sm px-2 py-1 bg-secondary rounded text-secondary-foreground">
                  {fileTypeInfo?.language || 'text'}
                </span>
              </div>
            </div>
            <CodeMirror 
              bind:value={content}
            />
          </div>
        {/if}
      {:else if content}
        <div class="p-4">
          <CodeMirror 
            bind:value={content}
          />
        </div>
      {:else}
        <div class="p-4">
          <div class="text-center text-muted-foreground py-8">
            No content available
          </div>
        </div>
      {/if}
    </div>
  {/if}
  
  <FileMetadataPanel 
    bind:isOpen={isMetadataPanelOpen}
    {file}
    {content}
    typeInfo={fileTypeInfo}
    {metadata}
  />
</div>
