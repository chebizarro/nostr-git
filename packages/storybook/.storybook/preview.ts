import '../../ui/src/App.css';
import { Router } from 'svelte-routing';
import type { Preview } from '@storybook/svelte'

export const decorators = [
  (Story) => ({
    Component: Router,
    props: {
      children: Story(),
      basepath: '/',
    },
  }),
];

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
