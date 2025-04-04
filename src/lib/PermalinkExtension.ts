import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { createNeventFromPermalink, type HexString } from './event.js';
import { generateSecretKey } from 'nostr-tools';
import { isPermalink } from './parsePermalink.js';

export interface PermalinkExtensionOptions {
  privateKey: HexString;
  relays: string[];
}

export const PermalinkExtension = Extension.create<PermalinkExtensionOptions>({
  name: 'permalinkExtension',

  addOptions() {
    return {
      privateKey: generateSecretKey(),
      relays: ['wss://relay.damus.io']
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('permalinkHandler'),
        props: {
          handlePaste: (view, event) => {
            const pastedText = event.clipboardData?.getData('text/plain');
            if (!pastedText) {
              return false;
            }
            createNeventFromPermalink(
              pastedText.trim(),
              this.options.privateKey,
              this.options.relays
            )
              .then((snippet: string) => {
                const { state, dispatch } = view;
                const tr = state.tr;
                const nodeType = state.schema.nodes.codeBlock;
                const node = nodeType.create(
                  {
                    language: 'markdown'
                  },
                  state.schema.text(snippet)
                );
                dispatch(tr.replaceSelectionWith(node).scrollIntoView());
              })
              .catch((error) => {
                console.info('Error creating Nostr event from permalink:', error);
              });
            if (isPermalink(pastedText.trim())) {
              // Prevent the default paste behavior
              event.preventDefault();
              // Return true to indicate that the event was handled
              return true;
            } else {
              // Allow the default paste behavior
              // Return false to indicate that the event was not handled
              return false;
            }
          }
        }
      })
    ];
  }
});
