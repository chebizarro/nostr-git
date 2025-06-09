<script lang="ts">
  import { AlertCircle, AlertTriangle, CheckCircle, FileText, GitMerge, XCircle } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  import DiffViewer from "./DiffViewer.svelte";
  const { Card, CardHeader, CardTitle, CardContent, Badge, Alert, AlertDescription } = useRegistry();

const { result } = $props();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return {icon: CheckCircle, color: "text-green-500"};
      case 'conflicts':
        return {icon: AlertTriangle, color: "text-orange-500"};
      case 'error':
        return {icon: XCircle, color: "text-red-500"};
      default:
        return {icon: AlertCircle, color: "text-gray-500"};
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'border-green-200 bg-green-50';
      case 'conflicts':
        return 'border-orange-200 bg-orange-50';
      case 'error':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

</script>

<Card class={`${getStatusColor(result.status)}`}>
    <CardHeader class="pb-3">
      <CardTitle class="text-sm flex items-center gap-2">
        {getStatusIcon(result.status)}
        Patch Application Result: {result.patchName}
        <Badge variant="outline" class="ml-auto">
          {result.status}
        </Badge>
      </CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      {#if result.status === 'success'}
        <Alert class="border-green-200 bg-green-50">
          <CheckCircle class="h-4 w-4 text-green-600" />
          <AlertDescription class="text-green-800">
            Patch applied successfully! {result.stats.filesChanged} files changed, 
            +{result.stats.insertions} insertions, -{result.stats.deletions} deletions.
          </AlertDescription>
        </Alert>
      {/if}

      {#if result.status === 'conflicts'}
        <Alert class="border-orange-200 bg-orange-50">
          <AlertTriangle class="h-4 w-4 text-orange-600" />
          <AlertDescription class="text-orange-800">
            Patch applied with merge conflicts. {result.conflicts?.length} files need manual resolution.
          </AlertDescription>
        </Alert>
      {/if}

      {#if result.status === 'error'}
        <Alert class="border-red-200 bg-red-50">
          <XCircle class="h-4 w-4 text-red-600" />
          <AlertDescription class="text-red-800">
            Failed to apply patch: {result.errorMessage}
          </AlertDescription>
        </Alert>
      {/if}

      <div class="grid grid-cols-3 gap-4 text-sm">
        <div class="text-center">
          <div class="text-lg font-semibold text-blue-600">{result.filesModified.length}</div>
          <div class="text-muted-foreground">Modified</div>
        </div>
        <div class="text-center">
          <div class="text-lg font-semibold text-green-600">{result.filesAdded.length}</div>
          <div class="text-muted-foreground">Added</div>
        </div>
        <div class="text-center">
          <div class="text-lg font-semibold text-red-600">{result.filesDeleted.length}</div>
          <div class="text-muted-foreground">Deleted</div>
        </div>
      </div>

      {#if result.conflicts && result.conflicts.length > 0}
        <div class="space-y-3">
          <h4 class="font-medium flex items-center gap-2">
            <GitMerge class="h-4 w-4" />
            Merge Conflicts ({result.conflicts.length})
          </h4>
          {#each result.conflicts as conflict (conflict.path)}
            <Card class="border-orange-200">
              <CardHeader class="pb-2">
                <CardTitle class="text-sm flex items-center gap-2">
                  <FileText class="h-4 w-4" />
                  {conflict.path}
                  <Badge variant="destructive" class="ml-auto">
                    {conflict.conflictMarkers.length} conflicts
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div class="space-y-2">
                  {#each conflict.conflictMarkers as marker (marker.path)}
                    <div class="border rounded p-3 bg-background">
                      <div class="text-xs text-muted-foreground mb-2">
                        Conflict at lines {marker.start}-{marker.end}
                      </div>
                      <pre class="text-xs font-mono whitespace-pre-wrap bg-secondary/50 p-2 rounded">
                        {marker.content}
                      </pre>
                    </div>
                  {/each}
                </div>
              </CardContent>
            </Card>
          {/each}
        </div>
      {/if}

      {#if result.diff}
        <div class="space-y-2">
          <h4 class="font-medium">Changes Preview</h4>
          <DiffViewer diff={result.diff} showLineNumbers={true} />
        </div>
      {/if}

      {#if result.filesModified.length > 0 || result.filesAdded.length > 0 || result.filesDeleted.length > 0}
        <div class="space-y-3">
          <h4 class="font-medium">File Changes</h4>
          
          {#if result.filesModified.length > 0}
            <div>
              <h5 class="text-sm font-medium text-blue-600 mb-2">Modified Files</h5>
              <div class="space-y-1">
                {#each result.filesModified as file (file.path)}
                  <div class="text-xs font-mono bg-blue-50 px-2 py-1 rounded">
                    {file.path}
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if result.filesAdded.length > 0}
            <div>
              <h5 class="text-sm font-medium text-green-600 mb-2">Added Files</h5>
              <div class="space-y-1">
                {#each result.filesAdded as file (file.path)}
                  <div class="text-xs font-mono bg-green-50 px-2 py-1 rounded">
                    + {file.path}
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if result.filesDeleted.length > 0}
            <div>
              <h5 class="text-sm font-medium text-red-600 mb-2">Deleted Files</h5>
              <div class="space-y-1">
                {#each result.filesDeleted as file (file.path)}
                  <div class="text-xs font-mono bg-red-50 px-2 py-1 rounded">
                    - {file.path}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </CardContent>
  </Card>
