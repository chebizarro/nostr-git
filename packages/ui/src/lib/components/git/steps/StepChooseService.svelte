<script lang="ts">
  import { Token } from '../../../stores/tokens';
  import ProviderSelectionStep from '../ProviderSelectionStep.svelte';

  interface Props {
    tokens: Token[];
    selectedProvider: 'github'|'gitlab'|'gitea'|'bitbucket'|'grasp' | null;
    relayUrl?: string;
    disabledProviders?: string[];
    onProviderChange: (p: 'github'|'gitlab'|'gitea'|'bitbucket'|'grasp') => void;
    onRelayUrlChange?: (url: string) => void;
    graspServerOptions?: string[];
  }

  const __props = $props();
  const tokens = $derived(__props.tokens);
  const selectedProvider = $derived(__props.selectedProvider);
  const relayUrl = $derived(__props.relayUrl);
  const disabledProviders = $derived(__props.disabledProviders ?? []);
  const onProviderChange = $derived(__props.onProviderChange);
  const onRelayUrlChange = $derived(__props.onRelayUrlChange);
  const graspServerOptions = $derived(__props.graspServerOptions ?? []);
</script>

<div class="space-y-4 max-h-[70vh]">
  <ProviderSelectionStep
    tokens={tokens}
    selectedProvider={selectedProvider || undefined}
    onProviderChange={onProviderChange as any}
    disabledProviders={disabledProviders}
    relayUrl={relayUrl || ''}
    onRelayUrlChange={onRelayUrlChange as any}
    graspServerOptions={graspServerOptions}
  />
</div>
