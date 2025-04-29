import * as path from 'path';
import { dirname, join } from 'path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
const { resolve } = path;

const root = resolve();

/** @type { import('@storybook/svelte-vite').StorybookConfig } */
export default {
  framework: {
    name: "@storybook/svelte-vite",
    options: {}
  },

  stories: [
    // Look for *.stories.* anywhere *inside* ui (monorepo safe)
    '../../ui/src/**/*.stories.@(js|ts|svelte)'
  ],

  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-svelte-csf"
  ],

  viteFinal: async (config: any) => {
    // Ensure Svelte plugin is included for .svelte file support
    config.plugins = config.plugins || [];
    config.plugins.push(svelte());
    // Make `ui` resolve to source, not dist
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      ui: resolve(root, '..', 'ui', 'src'),
      $lib: resolve(root, '..', 'ui', 'src', 'lib'),
    };
    return config;
  },

  docs: {
    autodocs: true
  }
};
