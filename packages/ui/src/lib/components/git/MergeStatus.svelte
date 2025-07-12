<script lang="ts">
  import {
    CheckCircle,
    AlertTriangle,
    XCircle,
    GitMerge,
    Clock,
    Info,
    FileText,
  } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  import type { MergeAnalysisResult } from "@nostr-git/core";
  import { toast } from "../../stores/toast";
  
  const { Card, CardHeader, CardTitle, CardContent, Badge, Alert, AlertDescription } = useRegistry();

  interface Props {
    result: MergeAnalysisResult | null;
    loading?: boolean;
    targetBranch?: string;
  }

  const { result, loading = false, targetBranch = 'main' }: Props = $props();

  const getStatusIcon = (analysis: string) => {
    switch (analysis) {
      case 'clean':
        return { icon: CheckCircle, color: 'text-green-500' };
      case 'conflicts':
        return { icon: AlertTriangle, color: 'text-orange-500' };
      case 'up-to-date':
        return { icon: Info, color: 'text-blue-500' };
      case 'error':
        return { icon: XCircle, color: 'text-red-500' };
      default:
        return { icon: Clock, color: 'text-gray-500' };
    }
  };

  const getStatusColor = (analysis: string) => {
    switch (analysis) {
      case 'clean':
        return 'border-green-200 bg-green';
      case 'conflicts':
        return 'border-orange-200 bg-orange';
      case 'up-to-date':
        return 'border-blue-200 bg-blue';
      case 'error':
        return 'border-red-200 bg-red';
      default:
        return 'border-gray-200 bg-gray';
    }
  };

  const getStatusMessage = (result: MergeAnalysisResult): string => {
    switch (result.analysis) {
      case 'clean':
        return result.fastForward 
          ? 'This patch can be fast-forward merged without conflicts.'
          : 'This patch can be merged cleanly without conflicts.';
      case 'conflicts':
        return `This patch has merge conflicts in ${result.conflictFiles.length} file(s) that need to be resolved.`;
      case 'up-to-date':
        return 'This patch has already been applied to the target branch.';
      case 'diverged':
        return 'The target branch has diverged. Manual intervention may be required.';
      case 'error':
        return `Unable to analyze merge: ${result.errorMessage || 'Unknown error'}`;
      default:
        return 'Merge analysis pending...';
    }
  };

  // Show toast notifications for merge analysis results
  $effect(() => {
    if (result && !loading) {
      switch (result.analysis) {
        case 'clean':
          toast.push({
            message: result.fastForward 
              ? 'Merge Ready: This patch can be fast-forward merged cleanly.'
              : 'Merge Ready: This patch can be merged without conflicts.',
            timeout: 4000
          });
          break;
        case 'conflicts':
          toast.push({
            message: `Merge Conflicts Detected: ${result.conflictFiles.length} file(s) have conflicts that need resolution.`,
            timeout: 6000,
            theme: 'error'
          });
          break;
        case 'up-to-date':
          toast.push({
            message: 'Already Up-to-Date: This patch has already been applied to the target branch.',
            timeout: 3000
          });
          break;
      }
    }
  });
</script>

<Card class={result ? getStatusColor(result.analysis) : 'border-gray-200'}>
  <CardHeader>
    <CardTitle class="flex items-center gap-2 text-md">
      <GitMerge class="h-4 w-4" />
      Merge Status
      {#if targetBranch}
        <span class="text-xs text-muted-foreground">→ {targetBranch}</span>
      {/if}
      <Badge variant="outline" class="ml-auto">
        {#if loading}
          Analyzing...
        {:else if result}
          {result.analysis}
        {:else}
          Pending
        {/if}
      </Badge>
    </CardTitle>
  </CardHeader>

  <CardContent>
    {#if loading}
      <div class="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock class="h-4 w-4 animate-spin" />
        Analyzing patch mergeability...
      </div>
    {:else if result}
      {#if result.analysis === 'clean'}
        <div class="space-y-2">
          <div class="flex items-center gap-2 text-sm">
            <CheckCircle class="h-4 w-4 text-green-500" />
            <span class="font-medium">Ready to merge</span>
          </div>
          {#if result.fastForward}
            <p class="text-xs text-muted-foreground">
              This is a fast-forward merge - no merge commit will be created.
            </p>
          {:else}
            <p class="text-xs text-muted-foreground">
              A merge commit will be created to combine the changes.
            </p>
          {/if}
        </div>
      {/if}

      {#if result.analysis === 'conflicts' && result.conflictDetails.length > 0}
        <div class="space-y-3">
          <h4 class="font-medium text-sm flex items-center gap-2">
            <FileText class="h-4 w-4" />
            Conflicting Files ({result.conflictFiles.length})
          </h4>
          
          <div class="space-y-2">
            {#each result.conflictDetails as conflict (conflict.file)}
              <Card class="border-orange-200">
                <CardContent class="p-3">
                  <div class="flex items-center justify-between mb-2">
                    <span class="font-mono text-sm">{conflict.file}</span>
                    <Badge variant="destructive" class="text-xs">
                      {conflict.conflictMarkers.length} conflicts
                    </Badge>
                  </div>
                  
                  <div class="text-xs text-muted-foreground">
                    Type: {conflict.type}
                  </div>
                  
                  {#if conflict.conflictMarkers.length > 0}
                    <div class="mt-2 space-y-1">
                      {#each conflict.conflictMarkers as marker (marker.start)}
                        <div class="text-xs bg-secondary/50 p-2 rounded">
                          <div class="text-muted-foreground mb-1">
                            Lines {marker.start}-{marker.end}: {marker.type.replace(/-/g, ' ')}
                          </div>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </CardContent>
              </Card>
            {/each}
          </div>
        </div>
      {/if}

      {#if result.patchCommits.length > 0}
        <div class="text-xs text-muted-foreground">
          <span class="font-medium">Patch commits:</span> {result.patchCommits.length}
          {#if result.targetCommit}
            <br />
            <span class="font-medium">Target:</span> {result.targetCommit.slice(0, 8)}
          {/if}
          {#if result.mergeBase}
            <br />
            <span class="font-medium">Merge base:</span> {result.mergeBase.slice(0, 8)}
          {/if}
        </div>
      {/if}
    {:else}
      <div class="text-sm text-muted-foreground">
        Click "Analyze Merge" to check if this patch can be merged cleanly.
      </div>
    {/if}
  </CardContent>
</Card>
