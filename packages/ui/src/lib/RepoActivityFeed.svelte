<script lang="ts">
    import { Activity } from "@lucide/svelte";
    import { formatDistanceToNow } from 'date-fns';
  
    import { Avatar, Button, Card } from "$lib/shadcdn";
  
    interface ActivityItem {
      id: string;
      type: 'commit' | 'discussion' | 'star';
      title: string;
      user: { name: string; avatar: string };
      timestamp: Date;
    }
  
const {
  activities = []
}: {
  activities?: ActivityItem[];
} = $props();

let isExpanded = $state(false);

function toggleExpand() {
  isExpanded = !isExpanded;
}
</script>
  
  <div class="space-y-6">
    <!-- header -->
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold">Recent Activity</h3>
      <Button variant="ghost" size="sm" class="gap-2">
        <Activity class="h-4 w-4" /> View all
      </Button>
    </div>
  
    <!-- feed -->
    <div class="space-y-4">
      {#each activities as a (a.id)}
        <Card>
          <div class="p-4 flex items-start gap-3">
            <Avatar size="sm"
                    src={a.user.avatar}
                    fallback={a.user.name.slice(0,2).toUpperCase()} />
  
            <div class="flex-1 space-y-1">
              <p class="text-sm">
                <span class="font-medium">{a.user.name}</span>&nbsp;{a.title}
              </p>
              <p class="text-xs text-muted-foreground">
                {formatDistanceToNow(a.timestamp, { addSuffix: true })}
              </p>
            </div>
          </div>
        </Card>
      {/each}
    </div>
  </div>
  