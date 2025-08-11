<script lang="ts">
  import ProviderSelectionStep from '../ProviderSelectionStep.svelte';
  import type { Token } from '$lib/stores/tokens.js';

  interface Props {
    tokens: Token[];
    selectedProvider: 'github'|'gitlab'|'gitea'|'bitbucket'|'grasp' | null;
    relayUrl?: string;
    disabledProviders?: string[];
    onProviderChange: (p: 'github'|'gitlab'|'gitea'|'bitbucket'|'grasp') => void;
    onRelayUrlChange?: (url: string) => void;
  }

  const { tokens, selectedProvider, relayUrl, disabledProviders = [], onProviderChange, onRelayUrlChange }: Props = $props();
</script>

<div class="space-y-4 max-h-[70vh]">
  <ProviderSelectionStep
    tokens={tokens}
    selectedProvider={selectedProvider || undefined}
    onProviderChange={onProviderChange as any}
    disabledProviders={disabledProviders}
    relayUrl={relayUrl || ''}
    onRelayUrlChange={onRelayUrlChange as any}
  />
</div>
