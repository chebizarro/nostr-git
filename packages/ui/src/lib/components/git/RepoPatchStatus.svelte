<script lang="ts">
  import StatusChip from "./StatusChip.svelte";
  import MaintainerBadge from "./MaintainerBadge.svelte";

  const { state, kind, reason, badgeRole, reviewRequested = false, className = "" } = $props<{
    state?: "open" | "draft" | "closed" | "merged" | "resolved";
    kind?: number;
    reason?: string;
    badgeRole?: "owner" | "maintainer" | null;
    reviewRequested?: boolean;
    className?: string;
  }>();
</script>

<div class={`flex items-center gap-2 ${className}`}>
  <StatusChip {state} {kind} {reason} />
  <MaintainerBadge role={badgeRole} />
  {#if reason}
    <div class="text-[10px] opacity-60" title={reason}>ⓘ</div>
  {/if}
</div>
