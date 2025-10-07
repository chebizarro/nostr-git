<script lang="ts">
  import { FileCode, Folder, Share, Download, Copy, Info } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Button, Spinner } = useRegistry();
  import { toast } from "../../stores/toast";
  import type { FileEntry } from "@nostr-git/core";
  import type { PermalinkEvent } from "@nostr-git/shared-types";
  import { GIT_PERMALINK } from "@nostr-git/shared-types";
  import type { Repo } from "./Repo.svelte";
  import CodeMirror from "svelte-codemirror-editor";
  import {
    detectFileType,
    getFileMetadata,
    type FileTypeInfo,
  } from "../../utils/fileTypeDetection";
  import FileMetadataPanel from "./FileMetadataPanel.svelte";
  import { ImageViewer, PDFViewer, VideoViewer, AudioViewer, BinaryViewer } from "./viewers";
  import { lineNumbers } from "@codemirror/view";

  const {
    file,
    getFileContent,
    setDirectory,
    repo,
    publish,
    editable = true,
  }: {
    file: FileEntry;
    getFileContent: (path: string) => Promise<string>;
    setDirectory: (path: string) => void;
    repo?: Repo;
    publish?: (permalink: PermalinkEvent) => Promise<void>;
    editable?: boolean;
  } = $props();

  const name = file.name;
  const type: string = (file.type ?? "file") as string;
  const path = file.path;
  const instanceId = Math.random().toString(36).substring(7);
  let content = $state("");
  let isExpanded = $state(false);
  let isMetadataPanelOpen = $state(false);
  let isLoading = $state(false);

  let fileTypeInfo = $state<FileTypeInfo | null>(null);
  let metadata = $state<Record<string, string>>({});
  let selectedStart: number | null = $state(null);
  let selectedEnd: number | null = $state(null);
  
  $effect(() => {
    console.log(`[${instanceId}:${path}] selectedStart changed to ${selectedStart}`);
  });
  
  let cmExtensions: any[] = $state([]);
  let showPermalinkMenu = $state(false);
  let editorHost: HTMLElement | null = $state(null);
  // Gutter context menu state (positioned near click)
  let showGutterMenu = $state(false);
  let gutterMenuX = $state(0);
  let gutterMenuY = $state(0);
  let isDraggingSelect = $state(false);

  let hasLoadedOnce = false;
  
  $effect(() => {
    if (isExpanded && type === "file") {
      // Clear selection only when FIRST opening a file, not on every re-render
      if (!hasLoadedOnce) {
        console.log(`[${instanceId}:${path}] file expanded for first time, clearing selection`);
        selectedStart = null;
        selectedEnd = null;
        hasLoadedOnce = true;
      }
      
      if (!content) {
        isLoading = true;
        getFileContent(path)
          .then((c) => {
            content = c;
            isLoading = false;

            fileTypeInfo = detectFileType(name, c);
            void loadLanguageExtension(name, fileTypeInfo);
          })
          .catch((error) => {
            toast.push({
              title: "Failed to load file content",
              description: error.message,
              variant: "destructive",
            });
          })
          .finally(() => {
            isLoading = false;
          });
      }
    } else if (isExpanded && type === "directory") {
      content = "";
      setDirectory(path);
    }
  });

  // Update URL hash from current selection when user selects lines
  function syncHashFromSelection() {
    console.log(`[${instanceId}:${path}] syncHash called, start=${selectedStart}, end=${selectedEnd}, current hash=${location.hash}`);
    if (selectedStart) {
      const hash = `#L${selectedStart}${selectedEnd ? `-L${selectedEnd}` : ""}`;
      if (location.hash !== hash) {
        console.log(`[${instanceId}:${path}] updating hash from ${location.hash} to ${hash}`);
        // Just update the hash directly - simple and works
        location.hash = hash;
        console.log(`[${instanceId}:${path}] hash is now ${location.hash}`);
      }
    }
  }
  
  // Get line numbers from browser's text selection
  function getLinesFromSelection(): { start: number; end: number } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return null;
    
    // startContainer/endContainer can be text nodes, so we need to get their parent element
    const getLineElement = (node: Node): HTMLElement | null => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return (node as HTMLElement).closest('.cm-line');
      } else if (node.parentElement) {
        return node.parentElement.closest('.cm-line');
      }
      return null;
    };
    
    const startLine = getLineElement(range.startContainer);
    const endLine = getLineElement(range.endContainer);
    
    if (!startLine || !endLine) return null;
    
    // Get all lines in the editor
    const allLines = Array.from(editorHost!.querySelectorAll('.cm-line')) as HTMLElement[];
    const startIdx = allLines.indexOf(startLine);
    const endIdx = allLines.indexOf(endLine);
    
    if (startIdx === -1 || endIdx === -1) return null;
    
    // Convert to 1-based line numbers
    return {
      start: Math.min(startIdx, endIdx) + 1,
      end: Math.max(startIdx, endIdx) + 1
    };
  }
  
  // Select lines in the CodeMirror editor
  function selectLinesInEditor(startLine: number, endLine: number) {
    if (!editorHost) return;
    
    const lines = Array.from(editorHost.querySelectorAll('.cm-line')) as HTMLElement[];
    if (lines.length === 0) return;
    
    // Ensure start <= end
    const start = Math.min(startLine, endLine);
    const end = Math.max(startLine, endLine);
    
    // Convert to 0-based indices
    const startIdx = start - 1;
    const endIdx = end - 1;
    
    if (startIdx < 0 || endIdx >= lines.length) return;
    
    const startLineEl = lines[startIdx];
    const endLineEl = lines[endIdx];
    
    if (!startLineEl || !endLineEl) return;
    
    // Create a range and select it
    const range = document.createRange();
    range.setStart(startLineEl, 0);
    range.setEnd(endLineEl, endLineEl.childNodes.length);
    
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  $effect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is inside any menu popup
      const inMenu = target.closest?.('.permalink-menu-popup');
      
      // Close menus if clicking outside
      if (!inMenu) {
        showPermalinkMenu = false;
        showGutterMenu = false;
      }
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  });
  
  // Watch for text selection changes in the editor
  $effect(() => {
    if (!editorHost) return;
    
    const handleSelectionChange = () => {
      // Only process if the selection is within our editor
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      
      const range = selection.getRangeAt(0);
      const startNode = range.startContainer;
      const endNode = range.endContainer;
      
      // Check if selection is within our editor
      if (!editorHost.contains(startNode) || !editorHost.contains(endNode)) return;
      
      // Get the selected lines
      const lines = getLinesFromSelection();
      if (lines && lines.start !== lines.end) {
        selectedStart = lines.start;
        selectedEnd = lines.end;
        syncHashFromSelection();
      }
    };
    
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  });

  // Capture gutter interactions from CodeMirror reliably
  $effect(() => {
    if (!editorHost) return;
    const getLineFromGutter = (el: HTMLElement | null) => {
      const text = el?.textContent || "";
      const n = parseInt(text.trim(), 10);
      return isNaN(n) ? null : n;
    };

    const handleClickOrContext = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const gutterEl = el?.closest?.('.cm-gutterElement') as HTMLElement | null;
      if (!gutterEl) return;
      
      const n = getLineFromGutter(gutterEl);
      if (n == null) return;
      
      // On left-click: just update selection, don't open menu
      if (e.type === 'click') {
        console.log(`[${instanceId}:${path}] click line ${n}, shift=${(e as MouseEvent).shiftKey}, current start=${selectedStart}`);
        if ((e as MouseEvent).shiftKey && selectedStart) {
          // Extend selection: keep start, set end
          selectedEnd = n;
          console.log(`[${instanceId}:${path}] after shift-click: start=${selectedStart}, end=${selectedEnd}`);
          
          // Select the text in the editor
          selectLinesInEditor(selectedStart, selectedEnd);
        } else {
          // New selection: set start, clear end
          selectedStart = n;
          selectedEnd = null;
          console.log(`[${instanceId}:${path}] after click: start=${selectedStart}, end=${selectedEnd}`);
        }
        syncHashFromSelection();
        return;
      }
      
      // On right-click: open menu with current selection (or set to clicked line)
      if (e.type === 'contextmenu') {
        e.preventDefault();
        
        // If no selection exists, select the clicked line
        if (!selectedStart) {
          selectedStart = n;
          selectedEnd = null;
          syncHashFromSelection();
        }
        
        // Open menu at mouse position
        const rect = editorHost!.getBoundingClientRect();
        gutterMenuX = Math.max(8, e.clientX - rect.left + editorHost!.scrollLeft);
        gutterMenuY = Math.max(8, e.clientY - rect.top + editorHost!.scrollTop);
        showPermalinkMenu = false;
        showGutterMenu = true;
      }
    };

    // Get line numbers from browser's text selection
    const getLinesFromSelection = (): { start: number; end: number } | null => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      if (range.collapsed) return null;
      
      // startContainer/endContainer can be text nodes, so we need to get their parent element
      const getLineElement = (node: Node): HTMLElement | null => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          return (node as HTMLElement).closest('.cm-line');
        } else if (node.parentElement) {
          return node.parentElement.closest('.cm-line');
        }
        return null;
      };
      
      const startLine = getLineElement(range.startContainer);
      const endLine = getLineElement(range.endContainer);
      
      if (!startLine || !endLine) return null;
      
      // Get all lines in the editor
      const allLines = Array.from(editorHost!.querySelectorAll('.cm-line')) as HTMLElement[];
      const startIdx = allLines.indexOf(startLine);
      const endIdx = allLines.indexOf(endLine);
      
      if (startIdx === -1 || endIdx === -1) return null;
      
      // Convert to 1-based line numbers
      return {
        start: Math.min(startIdx, endIdx) + 1,
        end: Math.max(startIdx, endIdx) + 1
      };
    };

    const handleMouseDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const gutterEl = el?.closest?.('.cm-gutterElement') as HTMLElement | null;
      // Allow starting selection from gutter or content
      if (!gutterEl && !el.closest?.('.cm-content')) return;
      const n = gutterEl ? getLineFromGutter(gutterEl) : null;
      if (n == null && gutterEl) return; // Gutter click but no line number
      if (n != null) {
        // Mark that we're potentially starting a drag, but don't change selection yet
        // The click handler will handle selection for simple clicks
        isDraggingSelect = true;
        showGutterMenu = false;
        if (gutterEl) e.preventDefault();
      }
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSelect) return;
      const el = e.target as HTMLElement;
      const gutterEl = el?.closest?.('.cm-gutterElement') as HTMLElement | null;
      const n = getLineFromGutter(gutterEl);
      if (n != null) {
        selectedEnd = n;
      }
      // Update hash during drag so user sees the range
      if (selectedStart && selectedEnd) {
        syncHashFromSelection();
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (isDraggingSelect) {
        isDraggingSelect = false;
        syncHashFromSelection();
        // Don't open menu on mouseup - wait for contextmenu
      }
    };
    
    const handleContentContextMenu = (e: MouseEvent) => {
      // Check if this is a right-click on selected text in content
      const el = e.target as HTMLElement;
      if (!el.closest?.('.cm-content')) return;
      
      const lines = getLinesFromSelection();
      if (lines && lines.start !== lines.end) {
        e.preventDefault();
        selectedStart = lines.start;
        selectedEnd = lines.end;
        syncHashFromSelection();
        const rect = editorHost!.getBoundingClientRect();
        gutterMenuX = Math.max(8, e.clientX - rect.left + editorHost!.scrollLeft);
        gutterMenuY = Math.max(8, e.clientY - rect.top + editorHost!.scrollTop);
        showPermalinkMenu = false;
        showGutterMenu = true;
      }
    };

    editorHost.addEventListener('click', handleClickOrContext, { capture: true } as any);
    editorHost.addEventListener('contextmenu', handleClickOrContext, { capture: true } as any);
    editorHost.addEventListener('contextmenu', handleContentContextMenu, { capture: true } as any);
    editorHost.addEventListener('mousedown', handleMouseDown, { capture: true } as any);
    window.addEventListener('mousemove', handleMouseMove, { capture: true } as any);
    window.addEventListener('mouseup', handleMouseUp, { capture: true } as any);
    return () => {
      editorHost?.removeEventListener('click', handleClickOrContext, { capture: true } as any);
      editorHost?.removeEventListener('contextmenu', handleClickOrContext, { capture: true } as any);
      editorHost?.removeEventListener('contextmenu', handleContentContextMenu, { capture: true } as any);
      editorHost?.removeEventListener('mousedown', handleMouseDown, { capture: true } as any);
      window.removeEventListener('mousemove', handleMouseMove, { capture: true } as any);
      window.removeEventListener('mouseup', handleMouseUp, { capture: true } as any);
    };
  });

  async function copyContent(event: MouseEvent | undefined) {
    event?.stopPropagation();
    try {
      if (!content) {
        content = await getFileContent(path);
      }

      if (fileTypeInfo?.category === "binary") {
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
    const hash = selectedStart
      ? `#L${selectedStart}${selectedEnd ? `-L${selectedEnd}` : ""}`
      : "";
    const shareUrl = `${location.origin}/git/repo/${path}${hash}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl);
      toast.push({
        title: "Link copied",
        description: "Permalink copied to clipboard.",
      });
    } else {
      toast.push({
        title: "Error",
        description: "Clipboard not available",
        variant: "destructive",
      });
    }
  }

  function showMetadata(event?: MouseEvent) {
    event?.stopPropagation();
    isMetadataPanelOpen = true;
  }

  function togglePermalinkMenu(event?: MouseEvent) {
    event?.stopPropagation();
    showGutterMenu = false;
    showPermalinkMenu = !showPermalinkMenu;
  }

  async function loadLanguageExtension(filename: string, info: FileTypeInfo | null) {
    try {
      const ext = (filename.split(".").pop() || "").toLowerCase();
      let mod: any | null = null;
      switch (ext) {
        case "ts":
        case "tsx":
        case "js":
        case "jsx":
          mod = await import("@codemirror/lang-javascript");
          cmExtensions = [mod.javascript({ jsx: true, typescript: ext.startsWith("ts") })];
          break;
        case "json":
          mod = await import("@codemirror/lang-json");
          cmExtensions = [mod.json()];
          break;
        case "css":
        case "scss":
        case "less":
          mod = await import("@codemirror/lang-css");
          cmExtensions = [mod.css()];
          break;
        case "html":
        case "svelte":
          mod = await import("@codemirror/lang-html");
          cmExtensions = [mod.html()];
          break;
        case "md":
        case "markdown":
          mod = await import("@codemirror/lang-markdown");
          cmExtensions = [mod.markdown()];
          break;
        case "py":
          mod = await import("@codemirror/lang-python");
          cmExtensions = [mod.python()];
          break;
        case "rs":
          mod = await import("@codemirror/lang-rust");
          cmExtensions = [mod.rust()];
          break;
        case "go":
          mod = await import("@codemirror/lang-go");
          cmExtensions = [mod.go()];
          break;
        case "java":
          mod = await import("@codemirror/lang-java");
          cmExtensions = [mod.java()];
          break;
        case "c":
        case "h":
        case "cc":
        case "cpp":
        case "cxx":
        case "hpp":
        case "hh":
          mod = await import("@codemirror/lang-cpp");
          cmExtensions = [mod.cpp()];
          break;
        case "yml":
        case "yaml":
          mod = await import("@codemirror/lang-yaml");
          cmExtensions = [mod.yaml()];
          break;
        // removed unsupported dynamic imports (toml, shell)
        case "sql":
          mod = await import("@codemirror/lang-sql");
          cmExtensions = [mod.sql()];
          break;
        case "xml":
          mod = await import("@codemirror/lang-xml");
          cmExtensions = [mod.xml()];
          break;
        default:
          cmExtensions = [];
      }
    } catch (e) {
      console.warn("Failed to load language extension", e);
      cmExtensions = [];
    }
    // Ensure line numbers are shown for code files
    try {
      const hasLineNumbers = (cmExtensions || []).some((e: any) => String(e ?? '').includes('lineNumbers'));
      if (!hasLineNumbers) {
        cmExtensions = [...cmExtensions, lineNumbers()];
      }
    } catch {}
  }

  function buildPermalinkEvent(): PermalinkEvent | null {
    try {
      if (!path) return null;
      if (!repo) return null;
      const tags: string[][] = [];
      // Extract current commit and branch
      let commit = "";
      let branch = "";
      try {
        branch = (repo.selectedBranch || repo.mainBranch || "").split("/").pop() || "";
        const hit = (repo.refs || []).find((r) => r.type === "heads" && r.name === branch);
        commit = hit?.commitId || "";
      } catch {}
      if (repo.address) tags.push(["a", repo.address]);
      const repoUrl = (repo.web && repo.web[0]) || (repo.clone && repo.clone[0]) || "";
      if (repoUrl) tags.push(["repo", repoUrl]);
      if (commit) {
        if (branch) tags.push([`refs/heads/${branch}`, commit]);
        tags.push(["commit", commit]);
      }
      tags.push(["file", path]);
      if (selectedStart) {
        if (selectedEnd) tags.push(["lines", String(selectedStart), String(selectedEnd)]);
        else tags.push(["lines", String(selectedStart)]);
      }
      if (fileTypeInfo?.language) tags.push(["l", String(fileTypeInfo.language)]);
      const evt: PermalinkEvent = {
        kind: GIT_PERMALINK,
        content: content || "",
        tags,
        pubkey: "",
        created_at: Math.floor(Date.now() / 1000),
        id: "",
        sig: "",
      };
      return evt;
    } catch (e) {
      console.warn("Failed to build permalink event", e);
      return null;
    }
  }

  async function createPermalink(event?: MouseEvent) {
    event?.stopPropagation();
    showPermalinkMenu = false;
    showGutterMenu = false;
    
    const evt = buildPermalinkEvent();
    if (!evt) {
      const missing = !repo ? "repo context" : "file path";
      toast.push({ title: "Cannot create permalink", description: `Missing ${missing}`, variant: "destructive" });
      return;
    }
    
    // Show immediate feedback
    toast.push({ title: "Creating permalink...", description: "Publishing to relays" });
    
    try {
      if (publish) {
        await publish(evt);
        toast.push({ title: "Permalink published", description: "Permalink published successfully" });
        console.log("Permalink published successfully", evt);
      } else {
        await navigator.clipboard.writeText(JSON.stringify(evt));
        toast.push({ title: "Permalink copied", description: "JSON copied to clipboard" });
        console.log("Permalink copied to clipboard", evt);
      }
    } catch (e: any) {
      console.error("Failed to create permalink", e);
      toast.push({ title: "Error", description: e?.message || String(e), variant: "destructive" });
    }
  }

  function copyLinkToLines(event?: MouseEvent) {
    event?.stopPropagation();
    showPermalinkMenu = false;
    showGutterMenu = false;
    shareLink();
  }


  function getFileIcon() {
    if (type === "directory") return Folder;
    if (fileTypeInfo?.icon) {
      const iconMap: Record<string, any> = {
        Image: FileCode,
        FileText: FileCode,
        Settings: FileCode,
        Container: FileCode,
        Hammer: FileCode,
        BookOpen: FileCode,
        Scale: FileCode,
        Braces: FileCode,
        Code2: FileCode,
        Terminal: FileCode,
        Binary: FileCode,
        Archive: FileCode,
        Video: FileCode,
        Music: FileCode,
      };
      return iconMap[fileTypeInfo.icon] || FileCode;
    }
    return FileCode;
  }
</script>

<div class="border" style="border-color: hsl(var(--border)); rounded-lg mb-2">
  <div
    role="button"
    tabindex="0"
    class="flex items-center justify-between p-2 hover:bg-secondary/30 cursor-pointer w-full text-left"
    onclick={() => (isExpanded = !isExpanded)}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isExpanded = !isExpanded; } }}
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
        <div class="relative" data-permalink-menu>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={togglePermalinkMenu} title="Permalink actions">
            <Share class="h-4 w-4" />
          </Button>
          {#if showPermalinkMenu}
            <div class="permalink-menu-popup absolute right-0 mt-1 z-10 w-44 rounded border bg-popover text-popover-foreground shadow-md" style="border-color: hsl(var(--border));">
              <button class="w-full text-left px-3 py-2 hover:bg-secondary/50" onclick={copyLinkToLines}>Copy link to {selectedStart ? (selectedEnd ? `lines ${selectedStart}-${selectedEnd}` : `line ${selectedStart}`) : 'file'}</button>
              <button class="w-full text-left px-3 py-2 hover:bg-secondary/50" onclick={createPermalink}>Create permalink</button>
            </div>
          {/if}
        </div>
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={downloadFile}>
          <Download class="h-4 w-4" />
        </Button>
        {#if editable && fileTypeInfo?.canEdit !== false}
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onclick={copyContent}>
            <Copy class="h-4 w-4" />
          </Button>
        {/if}
      </div>
    {/if}
  </div>

  {#if isExpanded && type === "file"}
    <div class="border-t" style="border-color: hsl(var(--border));">
      {#if isLoading}
        <div class="p-4">
          <Spinner>Fetching content...</Spinner>
        </div>
      {:else if content}
        {#if fileTypeInfo.category === "image"}
          <div class="p-4">
            <ImageViewer content={content} filename={name} mimeType={fileTypeInfo.mimeType} />
          </div>
        {:else if fileTypeInfo.category === "pdf"}
          <div class="p-4">
            <PDFViewer content={content} filename={name} />
          </div>
        {:else if fileTypeInfo.category === "video"}
          <div class="p-4">
            <VideoViewer content={content} filename={name} mimeType={fileTypeInfo.mimeType} />
          </div>
        {:else if fileTypeInfo.category === "audio"}
          <div class="p-4">
            <AudioViewer content={content} filename={name} mimeType={fileTypeInfo.mimeType} />
          </div>
        {:else if fileTypeInfo.category === "binary" || fileTypeInfo.category === "archive"}
          <div class="p-4">
            <BinaryViewer content={content} filename={name} />
          </div>
        {:else}
          <div class="p-4 border-t" style="border-color: hsl(var(--border));">
            <div class="mb-2 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-muted-foreground">Language:</span>
                <span class="text-sm px-2 py-1 bg-secondary rounded text-secondary-foreground">
                  {fileTypeInfo?.language || "text"}
                </span>
              </div>
            </div>
            <div class="relative" bind:this={editorHost} role="group" data-permalink-menu>
              <CodeMirror bind:value={content} extensions={cmExtensions.length ? cmExtensions : [lineNumbers()]} />
              {#if showGutterMenu}
                <div class="permalink-menu-popup absolute z-20 w-44 rounded border bg-popover text-popover-foreground shadow-md"
                     style="left: {gutterMenuX}px; top: {gutterMenuY}px; border-color: hsl(var(--border));">
                  <button class="w-full text-left px-3 py-2 hover:bg-secondary/50" onclick={copyLinkToLines}>
                    Copy link to {selectedStart ? (selectedEnd ? `lines ${selectedStart}-${selectedEnd}` : `line ${selectedStart}`) : 'file'}
                  </button>
                  <button class="w-full text-left px-3 py-2 hover:bg-secondary/50" onclick={createPermalink}>Create permalink</button>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      {:else}
        <div class="p-4">
          <div class="text-center text-muted-foreground py-8">No content available</div>
        </div>
      {/if}
    </div>
  {/if}

  <FileMetadataPanel
    bind:isOpen={isMetadataPanelOpen}
    file={file}
    content={content}
    typeInfo={fileTypeInfo}
    metadata={metadata}
  />
</div>
