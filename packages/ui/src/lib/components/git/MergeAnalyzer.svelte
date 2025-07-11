<script lang="ts">
  import { FileText, TrendingUp, AlertTriangle, CheckCircle, GitMerge } from '@lucide/svelte';
  import { useRegistry } from "../../useRegistry";
  const { Card, CardContent, CardHeader, CardTitle, Progress, Badge } = useRegistry();
  import DiffViewer from './DiffViewer.svelte';

  const { analysis, patch, commit } = $props();

  const mockDiff = `@@ -1,8 +1,12 @@
 import React from 'react';
+import { OAuthProvider } from './oauth';
 import { Button } from '@/components/ui/button';
 
 const LoginForm = () => {
+  const handleOAuthLogin = async (provider: string) => {
+    return await new OAuthProvider(provider).authenticate();
+  };
+
   return (
     <form className="space-y-4">
       <input type="email" placeholder="Email" />
@@ -9,5 +13,8 @@ const LoginForm = () => {
+      <Button onClick={() => handleOAuthLogin('github')}>
+        Login with GitHub
+      </Button>
     </form>
   );
 };`;
</script>

<div class="space-y-6">
  <!-- Compatibility Score -->
  <Card>
    <CardHeader class="pb-3">
      <CardTitle class="text-lg flex items-center gap-2">
        <TrendingUp class="h-5 w-5" />
        Compatibility Analysis
      </CardTitle>
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
              {analysis.autoMergeable ? 'Auto-mergeable' : 'Manual required'}
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
          <div class="flex items-center justify-between p-3 rounded border">
            <div class="flex items-center gap-3">
              <FileText class="h-4 w-4 text-muted-foreground" />
              <code class="text-sm font-mono">{file}</code>
            </div>
            <div class="flex items-center gap-2">
              {#if hasConflict}
                <Badge variant="destructive" class="text-xs">
                  <AlertTriangle class="h-2.5 w-2.5 mr-1" />
                  Conflict
                </Badge>
              {:else}
                <Badge variant="secondary" class="text-xs">
                  <CheckCircle class="h-2.5 w-2.5 mr-1" />
                  Clean
                </Badge>
              {/if}
              <span class="text-xs text-muted-foreground">
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
      <DiffViewer {diff} showLineNumbers={true} />
    </CardContent>
  </Card>
</div>
