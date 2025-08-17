import './storybook.css';
import type { Preview } from '@storybook/svelte'
// Removed addon-themes (React-based) to avoid React in preview

const preview: Preview = {
  parameters: {
    // Fully disable Controls so no type parser is pulled into preview
    controls: false as any,
  },
};

export default preview;
