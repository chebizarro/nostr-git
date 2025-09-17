<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { useRegistry } from "$lib/useRegistry";
  const { Button, Input, Label, Separator } = useRegistry();
  import { createGraspServersStore } from "../../stores/graspServers";
  import type { NostrEvent } from "@nostr-git/shared-types";
  import { Check, CirclePlus, Pen, Trash, X } from "@lucide/svelte";

  const { pubkey, identifier, urls }: { pubkey?: string; identifier?: string; urls?: string[] } =
    $props();

  const dispatch = createEventDispatcher<{
    save:
      | { unsigned: NostrEvent; urls: string[] }
      | {
          unsigned: { kind: number; created_at: number; tags: string[][]; content: string };
          urls: string[];
        };
    reload: void;
  }>();

  const store = createGraspServersStore(urls ?? [], identifier);
  let newUrl = $state("");
  let editingIndex = $state<number | null>(null);
  let editingValue = $state("");

  // If parent updates urls prop, reflect into local store
  $effect(() => {
    if (urls && Array.isArray(urls)) {
      store.setUrls(urls);
    }
  });

  function autoSave() {
    if (!pubkey) return;
    const unsigned = (store as any).buildUnsigned(pubkey);
    // Dispatch immediately; parent handles sign+publish and may feed back latest urls via prop
    dispatch("save", { unsigned, urls: ($store as any).urls });
  }
</script>

<div class="w-full max-w-2xl p-4">
  {#if $store.loading}
    <p class="text-sm text-muted-foreground">Loading…</p>
  {:else}
    {#if $store.error}
      <div class="text-sm text-red-600">{$store.error}</div>
    {/if}
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <Label class="w-24">Add URL</Label>
        <Input bind:value={newUrl} placeholder="wss://relay.ngit.dev" disabled={!pubkey} />
        <Button
          class="btn btn-primary btn-sm"
          onclick={() => {
            store.addUrl(newUrl);
            newUrl = "";
            autoSave();
          }}
          disabled={!pubkey}><CirclePlus />Add</Button
        >
      </div>
      <Separator />
      <div class="w-full">
        {#if $store.urls.length === 0}
          <p class="py-12 text-center opacity-75">No servers added yet!</p>
        {:else}
          <table class="w-full table-fixed">
            <thead>
              <tr>
                <th class="p-2 text-left w-2/3">Server URL</th>
                <th class="p-2 text-right w-1/3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each $store.urls as url, i}
                <tr class="hover:bg-neutral">
                  <td class="p-2 text-left">
                    {#if editingIndex === i}
                      <Input bind:value={editingValue} class="w-full" />
                    {:else}
                      <span class="truncate inline-block max-w-full align-middle">{url}</span>
                    {/if}
                  </td>
                  <td class="p-2 text-right">
                    <div class="flex gap-2 justify-end">
                      {#if editingIndex === i}
                        <Button
                          class="btn btn-primary btn-sm"
                          onclick={() => {
                            const next = [...$store.urls];
                            const v = editingValue.trim();
                            if (v) next[i] = v;
                            store.setUrls(Array.from(new Set(next)));
                            editingIndex = null;
                            editingValue = "";
                            autoSave();
                          }}
                          disabled={!pubkey}
                          aria-label="Save"
                        >
                          <Check />
                        </Button>
                        <Button
                          class="btn btn-secondary btn-sm"
                          onclick={() => {
                            editingIndex = null;
                            editingValue = "";
                          }}
                          disabled={!pubkey}
                          aria-label="Cancel"
                        >
                          <X />
                        </Button>
                      {:else}
                        <Button
                          class="btn btn-primary btn-sm"
                          onclick={() => {
                            editingIndex = i;
                            editingValue = url;
                          }}
                          disabled={!pubkey}
                          aria-label="Edit"
                        >
                          <Pen />
                        </Button>
                        <Button
                          class="btn btn-error btn-sm"
                          onclick={() => {
                            store.removeUrl(url);
                            autoSave();
                          }}
                          disabled={!pubkey}
                          aria-label="Delete"
                        >
                          <Trash />
                        </Button>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>
    </div>
  {/if}
</div>

<svelte:options runes={true} />

<style>
  :global(.text-muted-foreground) {
    color: hsl(215 16.3% 46.9%);
  }
</style>
