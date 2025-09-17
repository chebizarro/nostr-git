<script lang="ts">
  import { type NostrEvent } from "nostr-tools";
  import { onMount } from "svelte";

  import GitRepoComponent from "./GitRepoComponent.svelte";
  import GitRepoStateComponent from "./GitRepoStateComponent.svelte";
  import GitIssueComponent from "./GitIssueComponent.svelte";
  import GitPatchComponent from "./GitPatchComponent.svelte";
  import GitCommentComponent from "./GitCommentComponent.svelte";
  import GitStatusComponent from "./GitStatusComponent.svelte";
  import UnknownEventComponent from "./UnknownEventComponent.svelte";

  interface Props {
    event: NostrEvent;
  }

  let { event }: Props = $props();

  let componentType = $state<string>("unknown");
  let isKnownEvent = $state(false);

  const eventKind = $derived(event.kind);

  const getComponentType = (kind: number): string => {
    switch (kind) {
      case 30617:
        return "git-repo";
      case 30618:
        return "git-repo-state";
      case 1617:
        return "git-patch";
      case 1621:
        return "git-issue";
      case 1623:
        return "git-comment";
      case 1630:
      case 1631:
      case 1632:
      case 1633:
        return "git-status";
      case 7:
        return "reaction";
      case 10002:
        return "relay-list";
      case 14:
        return "encrypted-message";
      case 1111:
        return "long-form";
      case 31922:
        return "calendar-event";
      default:
        return "unknown";
    }
  };

  const checkIfKnownEvent = (kind: number): boolean => {
    const knownKinds = [
      30617, 30618, 1617, 1621, 1623, 1630, 1631, 1632, 1633, 7, 10002, 14, 1111, 31922,
    ];
    return knownKinds.includes(kind);
  };

  $effect(() => {
    if (event) {
      componentType = getComponentType(event.kind);
      isKnownEvent = checkIfKnownEvent(event.kind);
    }
  });

  onMount(() => {
    componentType = getComponentType(event.kind);
    isKnownEvent = checkIfKnownEvent(event.kind);
  });
</script>

<!-- Route to appropriate component based on event kind -->
{#if componentType === "git-repo"}
  <GitRepoComponent event={event} />
{:else if componentType === "git-repo-state"}
  <GitRepoStateComponent event={event} />
{:else if componentType === "git-issue"}
  <GitIssueComponent event={event} />
{:else if componentType === "git-patch"}
  <GitPatchComponent event={event} />
{:else if componentType === "git-comment"}
  <GitCommentComponent event={event} />
{:else if componentType === "git-status"}
  <GitStatusComponent event={event} />
{:else if isKnownEvent}
  <!-- For other known events that don't have dedicated components yet -->
  <UnknownEventComponent event={event} />
{:else}
  <!-- Fallback for truly unknown events -->
  <UnknownEventComponent event={event} />
{/if}
