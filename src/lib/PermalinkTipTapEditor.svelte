<script lang="ts">
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import { PermalinkExtension } from './PermalinkExtension.js';
  import { onDestroy, onMount } from 'svelte';

  let element: HTMLElement;
  let editor: Editor;

  onMount(() => {
    editor = new Editor({
      element: element,
      extensions: [
		StarterKit,
		PermalinkExtension
	],
      content: '<p>Paste a link!</p>'
    });
  });

  onDestroy(() => {
    editor?.destroy();
  });
</script>

<div bind:this={element}></div>
