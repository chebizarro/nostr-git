<script lang="ts">
  import { cn } from "$lib/utils";

  const {
    tabValue,
    label,
    href,
    icon,
    activeTab,
  }: {
    tabValue: string;
    label: string;
    href: string;
    icon?: any;
    activeTab: string;
  } = $props();

  const isActive = activeTab === tabValue;
</script>

<a
  href={href}
  class={cn(
    "ring-offset-background focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm",
    isActive ? "bg-background text-foreground" : "text-muted-foreground"
  )}
  data-state={isActive ? 'active' : undefined}
  data-sveltekit-noscroll
  aria-current={isActive ? 'page' : undefined}
  tabindex="0"
>
  <span class="flex items-center gap-2">
    {@render icon?.()}
    <span class="relative">{label}</span>
  </span>
</a>
