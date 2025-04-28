<script lang="ts">
	import { CollapsibleContent } from "./index.js";
	import { slide } from "svelte/transition";

	type $$Props = CollapsiblePrimitive.ContentProps;

	export let transition: $$Props["transition"] = slide;
	export let transitionConfig: $$Props["transitionConfig"] = {
		duration: 150,
	};
</script>

<CollapsibleContent {transition} {transitionConfig} {...$props()}>
	<slot />
</CollapsibleContent>
