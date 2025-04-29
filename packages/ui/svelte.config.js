import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  compilerOptions: {
    runes: true,
    customElement: false,
  },
  preprocess: vitePreprocess(),
};
