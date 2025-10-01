<script lang="ts">
  const { 
    nodeCount,
    roots,
    rootRevisions,
    edgesCount,
    topParents,
    parentOutDegree,
    parentChildren,
    maxShow,
  }: {
    nodeCount: number
    roots: string[]
    rootRevisions: string[]
    edgesCount: number | undefined
    topParents: string[] | undefined
    parentOutDegree: Record<string, number> | undefined
    parentChildren: Record<string, string[]> | undefined
    maxShow: number
  } = $props()

  const maxChildIdsInTooltip = 3
</script>

<div class="rounded-md border border-border bg-card p-3 text-xs">
  <div class="mb-1 font-semibold opacity-80">Patch Graph</div>
  <div class="flex flex-wrap gap-x-4 gap-y-1 opacity-80">
    <div class="whitespace-nowrap">nodes: {nodeCount}</div>
    {#if edgesCount !== undefined}
      <div class="whitespace-nowrap">edges: {edgesCount}</div>
    {/if}
    {#if roots?.length}
      <div class="flex items-center gap-1 min-w-0">
        <span class="whitespace-nowrap">roots:</span>
        <div class="flex flex-wrap gap-1 min-w-0">
          {#each roots.slice(0, maxShow) as r (r)}
            <span class="badge badge-ghost badge-sm truncate max-w-[100px]" title={r}>{r}</span>
          {/each}
          {#if roots.length > maxShow}
            <span>…</span>
          {/if}
        </div>
      </div>
    {/if}
    {#if rootRevisions?.length}
      <div class="flex items-center gap-1 min-w-0">
        <span class="whitespace-nowrap">root-revisions:</span>
        <div class="flex flex-wrap gap-1 min-w-0">
          {#each rootRevisions.slice(0, maxShow) as r (r)}
            <span class="badge badge-ghost badge-sm truncate max-w-[100px]" title={r}>{r}</span>
          {/each}
          {#if rootRevisions.length > maxShow}
            <span>…</span>
          {/if}
        </div>
      </div>
    {/if}
    {#if topParents?.length}
      <div class="flex items-center gap-1 min-w-0">
        <span class="whitespace-nowrap">top parents:</span>
        <div class="flex flex-wrap gap-1 min-w-0">
          {#each topParents.slice(0, maxShow) as r (r)}
            {@const kids = parentChildren?.[r] || []}
            {@const extra = kids.length > maxChildIdsInTooltip ? "…" : ""}
            <span
              class="badge badge-ghost badge-sm truncate max-w-[120px]"
              title={`${r} · ${parentOutDegree?.[r] ?? 0} children${
                kids.length
                  ? `: ${kids
                      .slice(0, maxChildIdsInTooltip)
                      .map(k => k.slice(0, 8))
                      .join(", ")}${extra}`
                  : ""
              }`}>
              {r}{#if parentOutDegree && parentOutDegree[r] !== undefined}
                ({parentOutDegree[r]}){/if}
            </span>
          {/each}
          {#if topParents.length > maxShow}
            <span>…</span>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
