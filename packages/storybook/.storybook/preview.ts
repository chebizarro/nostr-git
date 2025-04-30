import '../../ui/src/index.css';
import { Router } from 'svelte-routing';
import type { Preview } from '@storybook/svelte'
import { withThemeByClassName } from "@storybook/addon-themes";

export const decorators = [(Story: () => any) => ({
  Component: Router,
  props: {
    children: Story(),
    basepath: '/',
  },
}), withThemeByClassName({
    themes: {
        // nameOfTheme: 'classNameForTheme',
        light: '',
        dark: 'dark',
    },
    defaultTheme: 'light',
})];

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
  },
};

export default preview;
