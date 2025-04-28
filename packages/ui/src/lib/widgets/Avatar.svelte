<script lang="ts">
    import {onMount} from "svelte"
    import Icon from "@lib/widgets/Icon.svelte"
  
    const {
  src,
  fallback,
  size = 'md',
  alt = '',
  icon = 'user-rounded',
  style = '',
  class: userClass = ''
}: {
  src: string;
  fallback: string;
  size?: 'sm' | 'md' | 'lg' | number;
  alt?: string;
  icon?: string;
  style?: string;
  class?: string;
} = $props();
  
    let element: HTMLElement
  
    const rem = $derived(() => {
  if (typeof size === 'number') return size;
  if (size === 'sm') return 24;
  if (size === 'lg') return 48;
  return 32;
});
    onMount(() => {
      if (src) {
        const image = new Image();

        image.addEventListener('error', () => {
          element.querySelector('.hidden')?.classList.remove('hidden');
        });

        image.src = src;
      }
    });
  </script>

  <div
    bind:this={element}
    class="{userClass} relative !flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-cover bg-center"
    style="width: {rem}px; height: {rem}px; min-width: {rem}px; background-image: url({src}); {style}"
  >
    <Icon {icon} class={src ? "hidden" : ""} size={typeof rem === 'number' ? Math.round(rem * 0.8) : 20} />
  </div>
  