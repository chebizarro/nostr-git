<script lang="ts">
  // Simple branch selector. Expects a map of ref -> { commit: string }
  const { refs = {}, selected = "", disabled = false, onChange } = $props<{
    refs?: Record<string, { commit: string } | any>;
    selected?: string;
    disabled?: boolean;
    onChange?: (value: string) => void;
  }>();

  const refNames = Object.keys(refs || {}).sort();

  function handleChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    onChange?.(value);
  }
</script>

<label class="inline-flex items-center gap-2 text-xs">
  <span class="opacity-60">HEAD</span>
  <select class="select select-xs select-bordered" value={selected} onchange={handleChange} disabled={disabled}>
    {#each refNames as r}
      <option value={r}>{r}</option>
    {/each}
  </select>
</label>
