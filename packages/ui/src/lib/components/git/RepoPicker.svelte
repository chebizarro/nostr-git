<script lang="ts">
  import { debounce } from "throttle-debounce"
  import { onMount, tick } from "svelte"
  import { writable } from "svelte/store"
  import type { ThunkFunction } from "../../internal/function-registry"
  import { Button, Spinner } from "../../index"
  import { fly } from "svelte/transition"
  import { preventDefault } from "svelte/legacy"

  const GIT_REPO_BOOKMARK_DTAG = "git-repo-bookmark"

  // Props/closures injected by host app via FunctionProvider or direct props
  let {
    selectedRepos,
    fetchRepos,
    publishBookmarks,
    filters = [{ kinds: [30617] }],
    relays = [],
    makeRelayHint,
    onClose,
  }: {
    selectedRepos: Array<{ address: string; event: any; relayHint: string }>
    fetchRepos: ThunkFunction<{ filters: any[]; onResult: (events: any[]) => void }>
    publishBookmarks: ThunkFunction<{ tags: string[][]; relays?: string[] }>
    filters?: any[]
    relays?: string[]
    makeRelayHint?: (event: any) => string
    onClose?: () => void
  } = $props()

  let localSelectedReposState = $state([...selectedRepos])

  let unmounted = false
  let element: HTMLElement
  let scroller: any
  let limit = 30
  let loading = $state(true)
  let submitting = $state(false)

  // Repo events populated via injected fetch thunk
  const allRepoEvents = writable<any[]>([])
  let repoEventsArr = $state<any[]>([])
  allRepoEvents.subscribe((v) => (repoEventsArr = v))
  function startFetch() {
    const r = fetchRepos({
      filters,
      onResult: (events: any[]) => {
        allRepoEvents.set(events || [])
      },
    })
    return r?.controller
  }

  // Helpers to read name/description from NIP-34 tags
  function getRepoName(repo: any, fallback: string): string {
    try {
      const tags: string[][] = (repo?.tags || []) as string[][]
      return tags.find((t) => t[0] === 'name')?.[1] || fallback
    } catch { return fallback }
  }
  function getRepoDescription(repo: any): string {
    try {
      const tags: string[][] = (repo?.tags || []) as string[][]
      return tags.find((t) => t[0] === 'description')?.[1] || ''
    } catch { return '' }
  }

  const repos = $derived.by(() => {
    const elements = []

    for (const {address, event, relayHint} of localSelectedReposState) {
      elements.push({
        repo: event,
        relay: relayHint,
        address: address,
        selected: true,
      })
    }

    const list = (repoEventsArr || []).slice().reverse()
    for (const event of list) {
      const addressStr = (event as any).a || ""
      // If not provided, derive from tags in host app
      try {
        if (!addressStr) {
          const a = (event.tags || []).find((t: string[]) => t[0] === "a")
          if (a) {
            // full a-tag value
            // @ts-ignore
            event.a = a[1]
          }
        }
      } catch {}
      // Need to keep selected and unselected repos as distinct sets
      if (!localSelectedReposState.find(r => r.address === addressStr)) {
        const firstHint = makeRelayHint ? makeRelayHint(event) : ""

        elements.push({
          repo: event,
          relay: firstHint,
          address: addressStr,
          selected: false,
        })
      }
    }

    return elements
  })

  let searchTerm = $state("")
  let debouncedTerm = $state("")

  // Set up the debounced update
  const updateDebouncedTerm = debounce(500, term => {
    debouncedTerm = term
  })

  // Watch searchTerm changes
  $effect(() => {
    updateDebouncedTerm(searchTerm)
  })

  const searchedRepos = $derived.by(() => {
    const term = debouncedTerm.trim().toLowerCase()
    if (term.length <= 2) return repos
    return repos.filter(({ repo }) => {
      try {
        const tags: string[][] = (repo.tags || []) as string[][]
        const name = tags.find((t) => t[0] === "name")?.[1] || ""
        const desc = tags.find((t) => t[0] === "description")?.[1] || ""
        return name.toLowerCase().includes(term) || desc.toLowerCase().includes(term)
      } catch {
        return false
      }
    })
  })

  // Placeholder controller for compatibility
  const ctrl = { load: (_n: number) => {} }

  const uploading = writable(false)
  const back = () => onClose?.()

  const submit = async () => {
    submitting = true
    await tick()

    if ($uploading) return
    const atagList: string[][] = []

    for (const {address, relayHint} of localSelectedReposState) {
      atagList.push(["a", address, relayHint || ''])
    }

    const tags = [["d", GIT_REPO_BOOKMARK_DTAG], ...atagList]
    await publishBookmarks({ tags, relays }).controller

    submitting = false

    onClose?.()
  }

  onMount(() => {
    startFetch()
    return () => {
      unmounted = true
      selectedRepos = []
      scroller?.stop?.()
    }
  })

  const onRepoChecked = (relay: string, address: string, event: any, checked: boolean) => {
    if (checked) {
      localSelectedReposState.push({address, event, relayHint: relay})
    } else {
      localSelectedReposState = localSelectedReposState.filter(r => r.address !== address)
    }
    console.log("localSelectedReposState", localSelectedReposState)
    selectedRepos.push(...localSelectedReposState)
  }
</script>

{#snippet repoSelectCheckBox(relay: string, address: string, repo: any, selected: boolean)}
  <input
    slot="input"
    type="checkbox"
    class="toggle toggle-primary"
    checked={selected}
    onchange={event =>
      onRepoChecked(relay, address, repo, (event.target as HTMLInputElement).checked)} />
{/snippet}

<form class="column gap-4" onsubmit={preventDefault(submit)}>
  <div class="flex items-center justify-between">
    {#snippet title()}
      <div class="text-base font-semibold">Follow Git Repos</div>
    {/snippet}
    {#snippet info()}
      <div class="text-sm text-muted-foreground">Select repositories to track</div>
    {/snippet}
  </div>
  <label class="row-2 input input-bordered">
    <span class="opacity-60">Search</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      autofocus={false}
      bind:value={searchTerm}
      class="grow"
      type="text"
      placeholder="Search repos..." />
  </label>
  <div
    class="scroll-container -mt-2 flex h-96 flex-grow flex-col overflow-auto py-2"
    bind:this={element}>
    <div class="mt-2 text-xs uppercase opacity-70">Selected</div>
    {#each searchedRepos.filter(r => r.selected) as { repo, relay, address } (repo.id)}
      <div out:fly={{duration: 200}}>
        <!-- Minimal repo card (name + description) -->
        <div class="rounded-md border border-border bg-card p-3">
          <div class="text-sm font-semibold truncate">{getRepoName(repo, address)}</div>
          {#if getRepoDescription(repo)}
            <div class="mt-1 text-xs opacity-70 line-clamp-2">{getRepoDescription(repo)}</div>
          {/if}
        </div>
        <div class="flex w-full justify-end">
          <label class="inline-flex items-center gap-2">
            {@render repoSelectCheckBox(relay, address, repo, true)}
            <span class="text-xs opacity-70">Selected</span>
          </label>
        </div>
      </div>
    {/each}
    <div class="mt-3 text-xs uppercase opacity-70">Other</div>
    {#each searchedRepos.filter(r => !r.selected) as { repo, relay, address } (repo.id)}
      <div out:fly={{duration: 200}}>
        <div class="rounded-md border border-border bg-card p-3">
          <div class="text-sm font-semibold truncate">{getRepoName(repo, address)}</div>
          {#if getRepoDescription(repo)}
            <div class="mt-1 text-xs opacity-70 line-clamp-2">{getRepoDescription(repo)}</div>
          {/if}
        </div>
        <div class="flex w-full justify-end">
          <label class="inline-flex items-center gap-2">
            {@render repoSelectCheckBox(relay, address, repo, false)}
          </label>
        </div>
      </div>
    {/each}
    {#if loading || searchedRepos.length === 0}
      <p class="flex h-10 items-center justify-center py-20" out:fly>
        <Spinner {loading}>
          {#if loading}
            Looking for repos...
          {:else if searchedRepos.length === 0}
            No Repos found.
          {/if}
        </Spinner>
      </p>
    {/if}
  </div>
  <div class="mt-4 flex items-center justify-between">
    <Button variant="outline" size="sm" onclick={back}>
      Go back
    </Button>
    <Button 
      type="submit" 
      variant="git"
      disabled={submitting}>
      <Spinner 
        loading={submitting}
        minHeight={"min-h-6"}>
        Done
      </Spinner>
    </Button>
  </div>
</form>
