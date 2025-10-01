<script lang="ts">
  import { FileText, TrendingUp, AlertTriangle, CheckCircle, GitMerge } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Card, CardContent, CardHeader, CardTitle, Progress, Badge } = useRegistry();
  import DiffViewer from "./DiffViewer.svelte";

  interface Props {
    analysis: {
      similarity: number;
      autoMergeable: boolean;
      affectedFiles: string[];
      conflictCount: number;
    };
    // Can be a diff array or an object containing a `diff` field
    patch: any;
    analyzing?: boolean;
    onAnalyze?: () => void;
  }

  const { analysis, patch, analyzing, onAnalyze }: Props = $props();

  function handleAnalyze() {
    onAnalyze?.();
  }

  // Normalize diff input for DiffViewer
  const normalizedDiff = $derived(() => (Array.isArray(patch) ? patch : (patch?.diff ?? [])));
</script>

<div class="space-y-6">
  <!-- Compatibility Score -->
  <Card>
    <CardHeader class="pb-3">
      <div class="flex items-center justify-between">
        <CardTitle class="text-lg flex items-center gap-2">
          <TrendingUp class="h-5 w-5" />
          Compatibility Analysis
        </CardTitle>
        <button
          class="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded border hover:bg-accent transition-colors disabled:opacity-50"
          disabled={!!analyzing}
          onclick={handleAnalyze}
          aria-label="Analyze patch"
        >
          <GitMerge class="h-4 w-4" />
          Analyze
        </button>
      </div>
    </CardHeader>
    <CardContent>
      <div class="space-y-4">
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium">Code Similarity</span>
            <span class="text-sm text-muted-foreground">
              {Math.round(analysis.similarity * 100)}%
            </span>
          </div>
          <Progress value={analysis.similarity * 100} class="h-2" />
        </div>

        <div class="grid grid-cols-3 gap-4 pt-2">
          <div class="text-center">
            <div class="flex items-center justify-center gap-1 mb-1">
              {#if analysis.autoMergeable}
                <CheckCircle class="h-4 w-4 text-green-500" />
              {:else}
                <AlertTriangle class="h-4 w-4 text-orange-500" />
              {/if}
              <span class="text-sm font-medium">Merge Status</span>
            </div>
            <Badge variant={analysis.autoMergeable ? "default" : "destructive"}>
              {analysis.autoMergeable ? "Auto-mergeable" : "Manual required"}
            </Badge>
          </div>

          <div class="text-center">
            <div class="text-lg font-bold text-purple-600">
              {analysis.affectedFiles.length}
            </div>
            <div class="text-xs text-muted-foreground">Files affected</div>
          </div>

          <div class="text-center">
            <div class="text-lg font-bold text-orange-600">
              {analysis.conflictCount}
            </div>
            <div class="text-xs text-muted-foreground">Potential conflicts</div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- File Impact Analysis -->
  <Card>
    <CardHeader class="pb-3">
      <CardTitle class="text-lg flex items-center gap-2">
        <FileText class="h-5 w-5" />
        File Impact Analysis
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div class="space-y-3">
        {#each analysis.affectedFiles as file, index (file)}
          {@const hasConflict = analysis.conflictCount > 0 && index < analysis.conflictCount}
          <div class="flex items-center justify-between p-3 rounded border gap-3">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <FileText class="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <code class="text-sm font-mono truncate" title={file}>{file}</code>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              {#if hasConflict}
                <Badge variant="destructive" class="text-xs whitespace-nowrap">
                  <AlertTriangle class="h-2.5 w-2.5 mr-1" />
                  Conflict
                </Badge>
              {:else}
                <Badge variant="secondary" class="text-xs whitespace-nowrap">
                  <CheckCircle class="h-2.5 w-2.5 mr-1" />
                  Clean
                </Badge>
              {/if}
              <span class="text-xs text-muted-foreground whitespace-nowrap">
                +{Math.floor(Math.random() * 50)} -{Math.floor(Math.random() * 30)}
              </span>
            </div>
          </div>
        {/each}
      </div>
    </CardContent>
  </Card>

  <!-- Preview Changes -->
  <Card>
    <CardHeader class="pb-3">
      <CardTitle class="text-lg flex items-center gap-2">
        <GitMerge class="h-5 w-5" />
        Preview Changes
      </CardTitle>
    </CardHeader>
    <CardContent>
      <DiffViewer diff={normalizedDiff()} showLineNumbers={true} />
    </CardContent>
  </Card>
</div>
