<script lang="ts">
  import type { Repo } from "./Repo.svelte";

  const { repo }: { repo: Repo } = $props();

  // Get all refs (branches and tags) from BranchManager
  const refs = $derived(repo.refs);
  let branches = $derived(refs.filter((ref) => ref.type === "heads"));
  let tags = $derived(refs.filter((ref) => ref.type === "tags"));
  let selectedBranch = $derived(repo.selectedBranch || repo.mainBranch || "");

  $effect(() => {
    if (repo.refs.length > 0) {
      branches = repo.refs.filter((ref) => ref.type === "heads");
      tags = repo.refs.filter((ref) => ref.type === "tags");
      selectedBranch = repo.selectedBranch || repo.mainBranch || "";
    }
  });

  function handleChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const branchName = target.value;
    if (branchName) {
      repo.setSelectedBranch(branchName);
    }
  }
</script>

<div class="flex items-center gap-2">
  <select
    value={selectedBranch}
    onchange={handleChange}
    class="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {#if refs.length === 0}
      <option value="">No branches found</option>
    {:else}
      {#if branches.length > 0}
        <optgroup label="Branches">
          {#each branches as branch (branch.name)}
            <option value={branch.name}>
              {branch.name}{branch.name === repo.mainBranch ? " (default)" : ""}
            </option>
          {/each}
        </optgroup>
      {/if}
      {#if tags.length > 0}
        <optgroup label="Tags">
          {#each tags as tag (tag.name)}
            <option value={tag.name}>{tag.name}</option>
          {/each}
        </optgroup>
      {/if}
    {/if}
  </select>
</div>
