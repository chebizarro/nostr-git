<script lang="ts">
  import { debounce } from "throttle-debounce";
  import { onMount, tick } from "svelte";
  import { writable } from "svelte/store";
  import type { ThunkFunction } from "../../internal/function-registry";
  import { useRegistry } from "../../useRegistry";
  const { Button, Spinner } = useRegistry();
  import { fly } from "svelte/transition";
  import { preventDefault } from "svelte/legacy";
  import { GIT_REPO_BOOKMARK_DTAG } from "@nostr-git/core";


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
    selectedRepos: Array<{ address: string; event: any; relayHint: string }>;
    fetchRepos: ThunkFunction<{ filters: any[]; onResult: (events: any[]) => void }>;
    publishBookmarks: ThunkFunction<{ tags: string[][]; relays?: string[] }>;
    filters?: any[];
    relays?: string[];
    makeRelayHint?: (event: any) => string;
    onClose?: () => void;
  } = $props();

  let localSelectedReposState = $state([...selectedRepos]);

  let unmounted = false;
  let element: HTMLElement;
  let scroller: any;
  let limit = 30;
  let loading = $state(true);
  let submitting = $state(false);

  // Repo events populated via injected fetch thunk
  const allRepoEvents = writable<any[]>([]);
  let repoEventsArr = $state<any[]>([]);
  allRepoEvents.subscribe((v) => (repoEventsArr = v));
  
  // Cache for constructed addresses to avoid recalculating
  const addressCache = new Map<string, string>();
  
  function startFetch() {
    const r = fetchRepos({
      filters,
      onResult: (events: any[]) => {
        allRepoEvents.set(events || []);
      },
    });
    return r?.controller;
  }

  // Helpers to read name/description from NIP-34 tags
  function getRepoName(repo: any, fallback: string): string {
    try {
      const tags: string[][] = (repo?.tags || []) as string[][];
      return tags.find((t) => t[0] === "name")?.[1] || fallback;
    } catch {
      return fallback;
    }
  }
  function getRepoDescription(repo: any): string {
    try {
      const tags: string[][] = (repo?.tags || []) as string[][];
      return tags.find((t) => t[0] === "description")?.[1] || "";
    } catch {
      return "";
    }
  }

  const repos = $derived.by(() => {
    const elements = [];

    for (const { address, event, relayHint } of localSelectedReposState) {
      elements.push({
        repo: event,
        relay: relayHint,
        address: address,
        selected: true,
      });
    }

    const list = (repoEventsArr || []).slice().reverse();
    for (const event of list) {
      // Check cache first
      let addressStr = addressCache.get(event.id) || (event as any).a || "";
      
      // If not cached, construct address from event (kind:pubkey:d-tag)
      if (!addressStr) {
        try {
          const dTag = (event.tags || []).find((t: string[]) => t[0] === "d")?.[1];
          if (dTag && event.pubkey && event.kind) {
            addressStr = `${event.kind}:${event.pubkey}:${dTag}`;
            // Cache it for future lookups (outside $derived, so safe)
            addressCache.set(event.id, addressStr);
          }
        } catch (e) {
          console.error('[RepoPicker] Failed to construct address for event:', event.id, e);
        }
      }
      
      // Skip if no valid address
      if (!addressStr) continue;
      
      // Need to keep selected and unselected repos as distinct sets
      if (!localSelectedReposState.find((r) => r.address === addressStr)) {
        const firstHint = makeRelayHint ? makeRelayHint(event) : "";

        elements.push({
          repo: event,
          relay: firstHint,
          address: addressStr,
          selected: false,
        });
      }
    }

    return elements;
  });

  let searchTerm = $state("");
  let debouncedTerm = $state("");

  // Set up the debounced update
  const updateDebouncedTerm = debounce(500, (term) => {
    debouncedTerm = term;
  });

  // Watch searchTerm changes
  $effect(() => {
    updateDebouncedTerm(searchTerm);
  });

  const searchedRepos = $derived.by(() => {
    const term = debouncedTerm.trim().toLowerCase();
    if (term.length <= 2) return repos;
    return repos.filter(({ repo }) => {
      try {
        const tags: string[][] = (repo.tags || []) as string[][];
        const name = tags.find((t) => t[0] === "name")?.[1] || "";
        const desc = tags.find((t) => t[0] === "description")?.[1] || "";
        return name.toLowerCase().includes(term) || desc.toLowerCase().includes(term);
      } catch {
        return false;
      }
    });
  });

  // Placeholder controller for compatibility
  const ctrl = { load: (_n: number) => {} };

  const uploading = writable(false);
  const back = () => onClose?.();

  const submit = async () => {
    submitting = true;
    await tick();

    if ($uploading) return;
    const atagList: string[][] = [];

    for (const { address, relayHint } of localSelectedReposState) {
      atagList.push(["a", address, relayHint || ""]);
    }

    const tags = [["d", GIT_REPO_BOOKMARK_DTAG], ...atagList];
    await publishBookmarks({ tags, relays }).controller;

    submitting = false;

    onClose?.();
  };

  onMount(() => {
    startFetch();
    return () => {
      unmounted = true;
      selectedRepos = [];
      scroller?.stop?.();
    };
  });

  const onRepoChecked = (relay: string, address: string, event: any, checked: boolean) => {
    if (checked) {
      if (!address) {
        console.error('[RepoPicker] Cannot add repo without address:', event);
        return;
      }
      // Check if already added
      if (!localSelectedReposState.find(r => r.address === address)) {
        localSelectedReposState.push({ address, event, relayHint: relay });
      }
    } else {
      localSelectedReposState = localSelectedReposState.filter((r) => r.address !== address);
    }
    selectedRepos.push(...localSelectedReposState);
  };
</script>

{#snippet repoSelectCheckBox(relay: string, address: string, repo: any, selected: boolean)}
  <input
    slot="input"
    type="checkbox"
    class="toggle toggle-primary"
    checked={selected}
    onchange={(event) =>
      onRepoChecked(relay, address, repo, (event.target as HTMLInputElement).checked)}
  />
{/snippet}

<form class="flex flex-col gap-4 p-6" onsubmit={preventDefault(submit)}>
  <div class="flex flex-col gap-2">
    <div class="text-xl font-bold">Follow Git Repos</div>
    <div class="text-sm text-muted-foreground">Select repositories to track</div>
  </div>
  <div class="relative">
    <input
      bind:value={searchTerm}
      class="w-full rounded-md border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      type="text"
      placeholder="Search repos..."
    />
  </div>
  <div
    class="scroll-container -mt-2 flex h-96 flex-grow flex-col overflow-auto py-2"
    bind:this={element}
  >
    <div class="mb-2 mt-2 text-xs font-semibold uppercase tracking-wide opacity-70">Selected</div>
    {#each searchedRepos.filter((r) => r.selected) as { repo, relay, address } (repo.id)}
      <div class="mb-3" out:fly={{ duration: 200 }}>
        <div class="rounded-md border border-primary bg-card p-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold truncate">{getRepoName(repo, address)}</div>
              {#if getRepoDescription(repo)}
                <div class="mt-1 text-xs opacity-70 line-clamp-2">{getRepoDescription(repo)}</div>
              {/if}
            </div>
            <label class="inline-flex shrink-0 items-center gap-2">
              {@render repoSelectCheckBox(relay, address, repo, true)}
            </label>
          </div>
        </div>
      </div>
    {/each}
    <div class="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide opacity-70">Available</div>
    {#each searchedRepos.filter((r) => !r.selected) as { repo, relay, address } (repo.id)}
      <div class="mb-3" out:fly={{ duration: 200 }}>
        <div class="rounded-md border border-border bg-card p-3">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold truncate">{getRepoName(repo, address)}</div>
              {#if getRepoDescription(repo)}
                <div class="mt-1 text-xs opacity-70 line-clamp-2">{getRepoDescription(repo)}</div>
              {/if}
            </div>
            <label class="inline-flex shrink-0 items-center gap-2">
              {@render repoSelectCheckBox(relay, address, repo, false)}
            </label>
          </div>
        </div>
      </div>
    {/each}
    {#if loading || searchedRepos.length === 0}
      <p class="flex h-10 items-center justify-center py-20" out:fly>
        <Spinner loading={loading}>
          {#if loading}
            Looking for repos...
          {:else if searchedRepos.length === 0}
            No Repos found.
          {/if}
        </Spinner>
      </p>
    {/if}
  </div>
  <div class="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
    <Button variant="outline" size="sm" onclick={back} class="flex-1">Cancel</Button>
    <Button type="submit" variant="default" disabled={submitting} class="flex-1">
      <Spinner loading={submitting} minHeight={"min-h-6"}>Save Changes</Spinner>
    </Button>
  </div>
</form>
