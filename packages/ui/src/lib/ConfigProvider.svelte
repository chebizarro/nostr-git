<script lang="ts">
  import { setContext } from "svelte";
  import { REGISTRY, defaultRegistry, type Registry } from "./internal/component-registry";

  const { components = {}, children } = $props<{ components?: Partial<Registry>, children?: any }>();
  const registry: Registry = { ...defaultRegistry, ...components };
  setContext(REGISTRY, registry);
</script>

{@render children()}