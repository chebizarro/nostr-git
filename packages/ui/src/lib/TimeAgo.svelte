<script lang="ts">
  import { onDestroy } from "svelte";
  import { formatDistanceToNow } from "date-fns";
  const { date, addSuffix = true } = $props();
  let formatted = $state("");
  let interval: ReturnType<typeof setInterval>;

  function update() {
    formatted = formatDistanceToNow(new Date(date), { addSuffix });
  }

  update();
  interval = setInterval(update, 60_000); // update every minute

  onDestroy(() => clearInterval(interval));
</script>

<span>{formatted}</span>
