<script lang="ts">
  import {
    AlertTriangle,
    CheckCircle,
    Clock,
    GitPullRequest,
    XCircle,
  } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Card, CardHeader, CardTitle, CardContent, ScrollArea, Badge } = useRegistry();

  const { patches, selectedPatch, onPatchSelect } = $props();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "clean":
        return "border-green-200 hover:border-green-300";
      case "conflicts":
        return "border-orange-200 hover:border-orange-300";
      case "error":
        return "border-red-200 hover:border-red-300";
      case "pending":
        return "border-blue-200 hover:border-blue-300";
      default:
        return "border-gray-200 hover:border-gray-300";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "clean":
        return { icon: CheckCircle, color: "h-3 w-3 text-green-500" };
      case "conflicts":
        return { icon: AlertTriangle, color: "h-3 w-3 text-orange-500" };
      case "error":
        return { icon: XCircle, color: "h-3 w-3 text-red-500" };
      case "pending":
        return { icon: Clock, color: "h-3 w-3 text-blue-500" };
      default:
        return null;
    }
  };
</script>

<Card>
  <CardHeader class="pb-3">
    <CardTitle class="text-sm flex items-center gap-2">
      <GitPullRequest class="h-4 w-4" />
      Select Patch
    </CardTitle>
  </CardHeader>
  <CardContent class="p-0">
    <ScrollArea class="h-80">
      <div class="p-3 space-y-2">
        {#each patches as patch (patch.id)}
          <button
            type="button"
            class={`p-3 rounded-lg border w-full text-left transition-all ${
              selectedPatch?.id === patch.id
                ? "border-primary bg-primary/5 shadow-md"
                : getStatusColor(patch.status)
            }`}
            onclick={() => onPatchSelect(patch)}
          >
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-2">
                {getStatusIcon(patch.status)}
                <span class="font-medium text-sm">{patch.name}</span>
              </div>
              <Badge variant="outline" class="text-xs">
                {patch.status}
              </Badge>
            </div>

            <p class="text-xs text-muted-foreground mb-2 line-clamp-2">
              {patch.description}
            </p>

            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-3">
                <span class="text-green-600">+{patch.linesAdded}</span>
                <span class="text-red-600">-{patch.linesRemoved}</span>
                <span class="text-muted-foreground">{patch.filesChanged} files</span>
              </div>
              <div class="text-muted-foreground">
                {patch.createdAt}
              </div>
            </div>

            <div class="text-xs text-muted-foreground mt-1">
              by {patch.author}
            </div>
          </button>
        {/each}
      </div>
    </ScrollArea>
  </CardContent>
</Card>
