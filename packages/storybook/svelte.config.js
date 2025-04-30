import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  compilerOptions: {
    customElement: false,
  },
  preprocess: vitePreprocess(),
};
