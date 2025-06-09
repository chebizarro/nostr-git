<script lang="ts">
  import { Calendar, GitBranch, GitCommit, User } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const {
    Avatar,
    AvatarImage,
    AvatarFallback,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    ScrollArea,
    Badge,
  } = useRegistry();

  const { commits, selectedCommit, onCommitSelect } = $props();

  const getBranchColor = (branch: string) => {
    switch (branch) {
      case "main":
        return "bg-green-100 text-green-800 border-green-200";
      case "develop":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-purple-100 text-purple-800 border-purple-200";
    }
  };
</script>

<Card>
  <CardHeader class="pb-3">
    <CardTitle class="text-sm flex items-center gap-2">
      <GitCommit class="h-4 w-4" />
      Select Target Commit
    </CardTitle>
  </CardHeader>
  <CardContent class="p-0">
    <ScrollArea class="h-80">
      <div class="p-3 space-y-2">
        {#each commits as commit (commit.hash)}
          <button
            class={`w-full text-left p-3 rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-primary/50 ${
              selectedCommit?.hash === commit.hash
                ? "border-primary bg-primary/5 shadow-md"
                : "border-gray-200 hover:border-gray-300"
            }`}
            onclick={() => onCommitSelect(commit)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onCommitSelect(commit)}
            aria-pressed={selectedCommit?.hash === commit.hash}
          >
            <div class="flex items-start gap-3">
              <Avatar class="h-6 w-6 mt-0.5">
                <AvatarImage src={commit.authorAvatar} alt={commit.author} />
                <AvatarFallback class="text-xs">
                  {commit.author
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <code class="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded">
                    {commit.shortHash}
                  </code>
                  <Badge variant="outline" class={`text-xs ${getBranchColor(commit.branch)}`}>
                    <GitBranch class="h-2.5 w-2.5 mr-1" />
                    {commit.branch}
                  </Badge>
                </div>

                <p class="text-sm font-medium mb-1 line-clamp-2">
                  {commit.message}
                </p>

                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <div class="flex items-center gap-2">
                    <User class="h-3 w-3" />
                    <span>{commit.author}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <Calendar class="h-3 w-3" />
                    <span>{commit.timestamp}</span>
                  </div>
                </div>

                <div class="text-xs text-muted-foreground mt-1">
                  {commit.filesChanged} files changed
                </div>
              </div>
            </div>
          </button>
        {/each}
      </div>
    </ScrollArea>
  </CardContent>
</Card>
