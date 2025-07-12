<script lang="ts">
  const { event, url, noun, customActions } = $props()
</script>

<div class="flex items-center gap-2">
  {#if customActions}
    {@render customActions()}
  {/if}
</div>
