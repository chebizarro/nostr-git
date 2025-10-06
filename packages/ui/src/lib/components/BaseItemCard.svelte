<script lang="ts">
  import { useRegistry } from "../useRegistry";
  import type { Snippet } from "svelte";
  const { Card } = useRegistry();

  export type CardVariant = "issue" | "patch" | "commit";

  interface Props {
    variant?: CardVariant;
    accent?: "blue" | "purple" | "red" | "zinc" | "green" | "amber";
    href?: string;
    clickable?: boolean;
    compact?: boolean;
    // snippets
    children: Snippet;
    slotIcon?: Snippet;
    slotTitle?: Snippet;
    slotActions?: Snippet;
    slotMeta?: Snippet;
    slotTags?: Snippet;
    slotStatus?: Snippet;
    slotFooter?: Snippet;
    slotSide?: Snippet;
  }

  let {
    variant = "issue",
    accent = "zinc",
    href,
    clickable = false,
    compact = false,
    children,
    slotIcon,
    slotTitle,
    slotActions,
    slotMeta,
    slotTags,
    slotStatus,
    slotFooter,
    slotSide,
  }: Props = $props();

  const accentClass = $derived(() => {
    switch (accent) {
      case "blue":
        return "accent-blue-500";
      case "purple":
        return "accent-purple-500";
      case "red":
        return "accent-red-500";
      case "green":
        return "accent-green-500";
      case "amber":
        return "accent-amber-500";
      default:
        return "accent-zinc-500";
    }
  });
</script>

<Card class={`git-card transition-colors ${clickable ? 'hover:bg-accent/50' : ''}`}>
  <div class="flex items-start gap-3">
    <!-- Left column: icon / status indicator -->
    <div class="flex-shrink-0 mt-0.5">
      {@render slotIcon?.()}
    </div>

    <!-- Main content -->
    <div class="flex-1 min-w-0">
      <!-- Title row -->
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          {#if href}
            <a href={href} class={clickable ? 'cursor-pointer' : ''}>
              <h3 class={`text-base font-semibold leading-tight break-words line-clamp-2 ${clickable ? 'hover:text-accent transition-colors' : ''}`}>
                {@render slotTitle?.()}
              </h3>
              {#if !compact}
                <div class="text-sm text-muted-foreground">
                  <!-- optional subtitle snippet in future -->
                </div>
              {/if}
            </a>
          {:else}
            <h3 class={`text-base font-semibold leading-tight break-words line-clamp-2`}>
              {@render slotTitle?.()}
            </h3>
          {/if}
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          {@render slotActions?.()}
        </div>
      </div>

      <!-- Meta row: author, time, counts -->
      <div class="flex items-center flex-wrap gap-2 text-sm text-muted-foreground mb-1 overflow-hidden">
        {@render slotMeta?.()}
      </div>

      <!-- Body content -->
      <div class="my-3 text-sm text-muted-foreground min-w-0">
        {@render children?.()}
      </div>

      <!-- Tags / labels -->
      <div class="mb-2 inline-flex gap-1">
        {@render slotTags?.()}
      </div>

      <!-- Footer: status pill / controls -->
      <div class="flex items-center gap-2">
        {@render slotStatus?.()}
        <div class="ml-auto">{@render slotFooter?.()}</div>
      </div>
    </div>

    <!-- Right column optional (e.g., avatar) -->
    <div class="flex-shrink-0 w-10">
      {@render slotSide?.()}
    </div>
  </div>
</Card>
