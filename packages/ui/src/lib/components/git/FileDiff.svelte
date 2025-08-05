<script lang="ts">
  import { Plus, Minus, MessageSquarePlus, FileText, FilePlus, FileX, FileIcon } from '@lucide/svelte';
  import type { FileDiff } from '@nostr-git/shared-types';

  interface Props {
    fileDiff: FileDiff;
    expanded?: boolean;
    onToggleExpansion?: () => void;
    onSelectFile?: (filePath: string) => void;
    highlightLanguage?: string;
  }

  let { 
    fileDiff, 
    expanded = false, 
    onToggleExpansion, 
    onSelectFile,
    highlightLanguage 
  }: Props = $props();

  // Get file extension for syntax highlighting
  const getFileLanguage = (filepath: string): string => {
    if (highlightLanguage) return highlightLanguage;
    
    const ext = filepath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'py': 'python',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'sh': 'bash',
      'bash': 'bash',
      'zsh': 'bash',
      'fish': 'bash'
    };
    
    return langMap[ext || ''] || 'plaintext';
  };

  // Get status icon and color
  const getStatusInfo = (status: FileDiff['status']) => {
    switch (status) {
      case 'added':
        return { icon: FilePlus, color: 'text-green-600', bg: 'bg-green-50', label: 'A' };
      case 'deleted':
        return { icon: FileX, color: 'text-red-600', bg: 'bg-red-50', label: 'D' };
      case 'modified':
        return { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', label: 'M' };
      case 'renamed':
        return { icon: FileIcon, color: 'text-purple-600', bg: 'bg-purple-50', label: 'R' };
      default:
        return { icon: FileText, color: 'text-gray-600', bg: 'bg-gray-50', label: '?' };
    }
  };

  // Calculate line numbers for display
  const calculateLineNumbers = (hunk: FileDiff['diffHunks'][0]) => {
    const lines: Array<{
      oldLineNum: number | null;
      newLineNum: number | null;
      content: string;
      type: '+' | '-' | ' ';
    }> = [];

    let oldLineNum = hunk.oldStart;
    let newLineNum = hunk.newStart;

    for (const patch of hunk.patches) {
      if (patch.type === '+') {
        lines.push({
          oldLineNum: null,
          newLineNum: newLineNum,
          content: patch.line,
          type: patch.type
        });
        newLineNum++;
      } else if (patch.type === '-') {
        lines.push({
          oldLineNum: oldLineNum,
          newLineNum: null,
          content: patch.line,
          type: patch.type
        });
        oldLineNum++;
      } else {
        lines.push({
          oldLineNum: oldLineNum,
          newLineNum: newLineNum,
          content: patch.line,
          type: patch.type
        });
        oldLineNum++;
        newLineNum++;
      }
    }

    return lines;
  };

  // Get line type styling
  const getLineClass = (type: '+' | '-' | ' ') => {
    switch (type) {
      case '+':
        return 'bg-green-50 border-l-2 border-l-green-500';
      case '-':
        return 'bg-red-50 border-l-2 border-l-red-500';
      default:
        return 'bg-background hover:bg-muted/30';
    }
  };

  // Get line number styling
  const getLineNumClass = (type: '+' | '-' | ' ') => {
    switch (type) {
      case '+':
        return 'bg-green-100 text-green-700';
      case '-':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Highlight code content (placeholder - would need highlight.js dependency)
  const highlightCode = (content: string, language: string): string => {
    // For now, return plain content without highlighting
    // TODO: Add highlight.js dependency and implement syntax highlighting
    return content;
  };

  // Handle add comment placeholder
  const handleAddComment = (lineNum: number) => {
    console.log('Add comment at line:', lineNum, 'in file:', fileDiff.path);
  };

  const statusInfo = $derived(getStatusInfo(fileDiff.status));
  const language = $derived(getFileLanguage(fileDiff.path));
  const totalChanges = $derived(
    fileDiff.diffHunks.reduce((total, hunk) => 
      total + hunk.patches.filter(p => p.type !== ' ').length, 0
    )
  );
</script>

<div class="border border-border rounded-md overflow-hidden mb-4">
  <!-- File Header -->
  <button
    type="button"
    class="w-full flex items-center gap-3 p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
    onclick={() => {
      onToggleExpansion?.();
      onSelectFile?.(fileDiff.path);
    }}
    aria-expanded={expanded}
  >
    <!-- Status Icon -->
    <div class="flex items-center gap-2 shrink-0">
      <div class="w-6 h-6 rounded-sm {statusInfo.bg} flex items-center justify-center">
        {#if statusInfo.icon === FilePlus}
          <FilePlus class="h-4 w-4 {statusInfo.color}" />
        {:else if statusInfo.icon === FileX}
          <FileX class="h-4 w-4 {statusInfo.color}" />
        {:else if statusInfo.icon === FileText}
          <FileText class="h-4 w-4 {statusInfo.color}" />
        {:else if statusInfo.icon === FileIcon}
          <FileIcon class="h-4 w-4 {statusInfo.color}" />
        {:else}
          <FileText class="h-4 w-4 {statusInfo.color}" />
        {/if}
      </div>
      <span class="text-xs font-mono font-semibold {statusInfo.color} w-4">
        {statusInfo.label}
      </span>
    </div>

    <!-- File Path -->
    <div class="flex-1 min-w-0">
      <div class="font-mono text-sm truncate" title={fileDiff.path}>
        {fileDiff.path}
      </div>
      {#if totalChanges > 0}
        <div class="text-xs text-muted-foreground">
          {totalChanges} change{totalChanges !== 1 ? 's' : ''}
        </div>
      {/if}
    </div>

    <!-- Expansion Indicator -->
    <div class="shrink-0">
      {#if expanded}
        <svg class="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
        </svg>
      {:else}
        <svg class="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      {/if}
    </div>
  </button>

  <!-- File Diff Content -->
  {#if expanded && fileDiff.diffHunks.length > 0}
    <div class="divide-y divide-border">
      {#each fileDiff.diffHunks as hunk, hunkIndex}
        {@const lines = calculateLineNumbers(hunk)}
        
        <!-- Hunk Header -->
        <div class="bg-muted px-4 py-2 text-sm font-mono text-muted-foreground border-b border-border">
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
          <span class="ml-2 text-foreground">{fileDiff.path}</span>
        </div>

        <!-- Diff Lines -->
        <div class="divide-y divide-border">
          {#each lines as line, lineIndex}
            <div class="flex {getLineClass(line.type)} group">
              <!-- Line Numbers -->
              <div class="flex shrink-0">
                <!-- Old Line Number -->
                <div class="w-12 px-2 py-1 text-right text-xs font-mono {getLineNumClass(line.type)} border-r border-border">
                  {line.oldLineNum || ''}
                </div>
                <!-- New Line Number -->
                <div class="w-12 px-2 py-1 text-right text-xs font-mono {getLineNumClass(line.type)} border-r border-border">
                  {line.newLineNum || ''}
                </div>
              </div>

              <!-- Change Indicator -->
              <div class="w-6 px-1 py-1 text-center text-xs font-mono {getLineNumClass(line.type)} border-r border-border">
                {#if line.type === '+'}
                  <Plus class="h-3 w-3 mx-auto text-green-600" />
                {:else if line.type === '-'}
                  <Minus class="h-3 w-3 mx-auto text-red-600" />
                {:else}
                  <span class="text-muted-foreground"> </span>
                {/if}
              </div>

              <!-- Line Content -->
              <div class="flex-1 px-2 py-1 font-mono text-sm overflow-x-auto">
                <pre class="whitespace-pre-wrap break-all">{@html highlightCode(line.content, language)}</pre>
              </div>

              <!-- Add Comment Button -->
              <div class="w-8 px-1 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
        {#if hunkIndex < fileDiff.diffHunks.length - 1}
          <div class="h-2 bg-muted border-t border-border"></div>
        {/if}
      {/each}
    </div>
  {:else if expanded && fileDiff.diffHunks.length === 0}
    <div class="p-4 text-center text-muted-foreground">
      {#if fileDiff.status === 'deleted'}
        File was deleted
      {:else if fileDiff.status === 'added'}
        Empty file was added
      {:else}
        No diff content available
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Ensure code content doesn't break layout */
  pre {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
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

  /* Syntax highlighting overrides */
  :global(.hljs) {
    background: transparent !important;
    color: inherit !important;
  }
</style>
