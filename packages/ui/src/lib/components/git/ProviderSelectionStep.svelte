<script lang="ts">
  import { useRegistry } from "../../useRegistry";
  import { tokens as tokensStore, type Token } from "../../stores/tokens.js";
  import { onMount } from "svelte";

  const { Button, Card, CardContent, CardHeader, CardTitle } = useRegistry();

  interface Props {
    selectedProvider?: string;
    onProviderChange: (provider: string) => void;
    disabledProviders?: string[];
    relayUrl?: string;
    onRelayUrlChange?: (url: string) => void;
    graspServerOptions?: string[];
  }
  const {
    selectedProvider,
    onProviderChange,
    disabledProviders,
    relayUrl,
    onRelayUrlChange,
    graspServerOptions,
  }: Props = $props();

  let tokens = $state<Token[]>([]);
  let graspRelayUrl = $state<string>("");
  let availableProviders = $state<
    {
      id: string;
      name: string;
      host: string;
      icon: string;
      description: string;
      hasToken: boolean;
      disabled?: boolean;
      disabledReason?: string;
    }[]
  >([]);

  // Subscribe to token store changes
  tokensStore.subscribe((t) => {
    tokens = t;
    updateAvailableProviders();
  });

  onMount(async () => {
    // Ensure tokens are loaded
    await tokensStore.waitForInitialization();
    updateAvailableProviders();
  });

  // Keep local input in sync if parent updates relayUrl prop
  $effect(() => {
    const next = relayUrl || "";
    if (graspRelayUrl !== next) {
      graspRelayUrl = next;
    }
  });

  function updateAvailableProviders() {
    const providers = [
      {
        id: "github",
        name: "GitHub",
        host: "github.com",
        icon: "🐙",
        description: "Create repository on GitHub.com",
        hasToken: tokens.some((t) => t.host === "github.com"),
      },
      {
        id: "gitlab",
        name: "GitLab",
        host: "gitlab.com",
        icon: "🦊",
        description: "Create repository on GitLab.com",
        hasToken: tokens.some((t) => t.host === "gitlab.com"),
      },
      {
        id: "gitea",
        name: "Gitea",
        host: "gitea.io",
        icon: "🍃",
        description: "Create repository on self-hosted Gitea",
        hasToken: tokens.some((t) => t.host.includes("gitea")),
      },
      {
        id: "bitbucket",
        name: "Bitbucket",
        host: "bitbucket.org",
        icon: "🪣",
        description: "Create repository on Bitbucket.org",
        hasToken: tokens.some((t) => t.host === "bitbucket.org"),
      },
      {
        id: "grasp",
        name: "GRASP Relay",
        host: "nostr-relay",
        icon: "⚡",
        description: "Create decentralized repository on Nostr relay",
        hasToken: true, // GRASP uses Nostr signer, always available
      },
    ];

    // Mark providers as disabled if they have name conflicts
    availableProviders = providers.map((provider) => {
      const conflict = disabledProviders.includes(provider.id);
      const isGrasp = provider.id === "grasp";
      const isDisabled = isGrasp ? false : conflict;
      return {
        ...provider,
        disabled: isDisabled,
        disabledReason: isDisabled ? "Repository name already exists" : undefined,
        // Keep GRASP selectable regardless of name conflicts; others require token and no conflict
        hasToken: isGrasp ? false : provider.hasToken && !isDisabled,
      };
    });

    // Auto-select first available provider if none selected
    if (!selectedProvider && providers.some((p) => p.hasToken)) {
      const firstAvailable = providers.find((p) => p.hasToken);
      if (firstAvailable) {
        onProviderChange(firstAvailable.id);
      }
    }
  }

  function handleProviderSelect(providerId: string) {
    onProviderChange(providerId);
  }

  function handleRelayUrlChange(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    graspRelayUrl = value;
    if (onRelayUrlChange) {
      onRelayUrlChange(value);
    }
  }

  function isValidRelayUrl(url: string): boolean {
    return url.trim() !== "" && (url.startsWith("wss://") || url.startsWith("ws://"));
  }
</script>

<div class="space-y-6">
  <div class="space-y-2">
    <h3 class="text-lg font-semibold text-foreground">Choose Git Service</h3>
    <p class="text-sm text-muted-foreground">
      Select where you'd like to create your new repository. Only services with configured
      authentication tokens are available.
    </p>
  </div>

  <div class="grid gap-4">
    {#each availableProviders as provider (provider.id)}
      <Card
        class="cursor-pointer transition-all duration-200 hover:shadow-md {selectedProvider ===
        provider.id
          ? 'ring-2 ring-accent border-accent'
          : ''} {!provider.hasToken ? 'opacity-50 cursor-not-allowed' : ''}"
        onclick={() => provider.hasToken && handleProviderSelect(provider.id)}
      >
        <CardContent class="p-4">
          <div class="flex items-center space-x-4">
            <div class="text-2xl">{provider.icon}</div>
            <div class="flex-1">
              <div class="flex items-center space-x-2">
                <h4 class="font-medium text-foreground">{provider.name}</h4>
                {#if selectedProvider === provider.id}
                  <div class="w-2 h-2 bg-accent rounded-full"></div>
                {/if}
                {#if provider.disabled}
                  <span
                    class="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-1 rounded"
                    >Name Conflict</span
                  >
                {:else if !provider.hasToken}
                  <span class="text-xs bg-muted text-muted-foreground px-2 py-1 rounded"
                    >No Token</span
                  >
                {/if}
              </div>
              <p class="text-sm text-muted-foreground mt-1">{provider.description}</p>
              {#if provider.hasToken && provider.id !== "grasp"}
                <p class="text-xs text-muted-foreground mt-1">
                  Token configured for {provider.host}
                </p>
              {:else if provider.id === "grasp"}
                <p class="text-xs text-muted-foreground mt-1">
                  Uses Nostr signer for authentication
                </p>
              {/if}
            </div>
            <div class="flex items-center">
              {#if selectedProvider === provider.id}
                <div class="w-4 h-4 bg-accent rounded-full flex items-center justify-center">
                  <div class="w-2 h-2 bg-accent-foreground rounded-full"></div>
                </div>
              {:else}
                <div class="w-4 h-4 border-2 border-muted-foreground rounded-full"></div>
              {/if}
            </div>
          </div>
        </CardContent>
      </Card>
    {/each}
  </div>

  {#if availableProviders.filter((p) => p.hasToken).length === 0}
    <div class="text-center py-8 space-y-4">
      <div class="text-4xl">🔐</div>
      <div class="space-y-2">
        <h4 class="font-medium text-foreground">No Authentication Tokens Found</h4>
        <p class="text-sm text-muted-foreground max-w-md mx-auto">
          You need to configure authentication tokens for at least one Git service before creating a
          repository. Go to Settings to add your GitHub, GitLab, Gitea, or Bitbucket tokens.
        </p>
      </div>
      <Button variant="outline" size="sm">Go to Settings</Button>
    </div>
  {:else if !selectedProvider}
    <div class="text-center py-4">
      <p class="text-sm text-muted-foreground">Please select a Git service to continue.</p>
    </div>
  {:else if selectedProvider === "grasp"}
    <div class="bg-muted/50 rounded-lg p-4 space-y-4">
      <div class="flex items-center space-x-2">
        <div class="w-2 h-2 bg-green-500 rounded-full"></div>
        <p class="text-sm text-foreground">
          Ready to create repository on <strong
            >{availableProviders.find((p) => p.id === selectedProvider)?.name}</strong
          >
        </p>
      </div>

      <div class="space-y-2">
        <label for="relay-url" class="block text-sm font-medium text-foreground">
          GRASP Relay URL
        </label>
        <input
          id="relay-url"
          type="text"
          class="w-full px-3 py-2 bg-background border border-input rounded-md text-sm"
          class:border-red-500={selectedProvider === "grasp" && !isValidRelayUrl(graspRelayUrl)}
          value={graspRelayUrl}
          oninput={handleRelayUrlChange}
          placeholder="wss://relay.example.com"
        />
        {#if graspServerOptions.length > 0}
          <div class="flex flex-wrap gap-2 mt-2">
            {#each graspServerOptions as opt}
              <button
                type="button"
                class="px-2 py-1 text-xs rounded border hover:bg-muted"
                onclick={() => {
                  graspRelayUrl = opt;
                  if (onRelayUrlChange) onRelayUrlChange(opt);
                }}
                title={opt}
              >
                {opt}
              </button>
            {/each}
          </div>
        {/if}
        {#if selectedProvider === "grasp" && graspRelayUrl && !isValidRelayUrl(graspRelayUrl)}
          <p class="text-sm text-destructive mt-1">
            Please enter a valid WebSocket URL (must start with ws:// or wss://)
          </p>
        {:else}
          <p class="text-xs text-muted-foreground">
            Enter the WebSocket URL of the GRASP relay where you want to create the repository
          </p>
        {/if}
      </div>
    </div>
  {:else}
    <div class="bg-muted/50 rounded-lg p-4">
      <div class="flex items-center space-x-2">
        <div class="w-2 h-2 bg-green-500 rounded-full"></div>
        <p class="text-sm text-foreground">
          Ready to create repository on <strong
            >{availableProviders.find((p) => p.id === selectedProvider)?.name}</strong
          >
        </p>
      </div>
    </div>
  {/if}
</div>

<svelte:options runes={true} />
