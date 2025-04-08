import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { createNeventFromPermalink } from './event.js';
import { type EventTemplate, type NostrEvent } from 'nostr-tools';
import { isPermalink } from './parsePermalink.js';
import { Buffer } from 'buffer';

type WindowWithBuffer = Window &
  typeof globalThis & {
    Buffer?: typeof Buffer;
  };

if (typeof window !== 'undefined' && !(window as WindowWithBuffer).Buffer) {
  (window as WindowWithBuffer).Buffer = Buffer;
}

export interface PermalinkExtensionOptions {
  signer: (event: EventTemplate) => Promise<NostrEvent>;
  relays: string[];
}

export const PermalinkExtension = Extension.create<PermalinkExtensionOptions>({
  name: 'permalinkExtension',

  addOptions() {
    return {
      signer: window.nostr.signEvent,
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
            createNeventFromPermalink(pastedText.trim(), this.options.signer, this.options.relays)
              .then((snippet: string) => {
                view.dispatch(
                  view.state.tr.insertText(
                    snippet,
                    view.state.selection.from,
                    view.state.selection.to
                  )
                );
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
