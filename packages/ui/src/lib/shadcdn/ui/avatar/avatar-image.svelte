<script lang="ts">
	import { AvatarImage } from "./index.js";
	import { cn } from "$lib/utils.js";

	type $$Props = AvatarPrimitive.ImageProps;

	let className: $$Props["class"] = undefined;
	export let src: $$Props["src"] = undefined;
	export let alt: $$Props["alt"] = undefined;
	export { className as class };
</script>

<AvatarImage
	{src}
	{alt}
	class={cn("aspect-square h-full w-full", className)}
	{...$props()}
/>
