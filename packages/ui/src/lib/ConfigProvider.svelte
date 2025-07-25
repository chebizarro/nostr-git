<script lang="ts">
  import { setContext } from "svelte";
  import { REGISTRY, defaultRegistry, type Registry } from "./internal/component-registry";
  import { SIGNER_CONTEXT } from "./internal/signer-context";
  import { type SignerContext, defaultSignerContext } from "./types/signer";

  const { components = {}, signerContext = defaultSignerContext, children } = $props<{
    components?: Partial<Registry>;
    signerContext?: SignerContext;
    children?: any;
  }>();
  
  const registry: Registry = { ...defaultRegistry, ...components };
  setContext(REGISTRY, registry);
  setContext(SIGNER_CONTEXT, signerContext);
</script>

{@render children()}
