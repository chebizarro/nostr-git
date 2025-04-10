import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { type EventTemplate, type NostrEvent } from 'nostr-tools';
import { isPermalink } from './parsePermalink.js';
import { Buffer } from 'buffer';
import { PermalinkNode } from './PermalinkNodeView.js';

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
      signer: window.nostr ? window.nostr.signEvent : null,
      relays: ['wss://relay.damus.io']
    };
  },

  addExtensions() {
    return [
      PermalinkNode.configure({
        signer: this.options.signer,
        relays: this.options.relays
      })
    ];
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

            if (isPermalink(pastedText)) {
              event.preventDefault();

              const { state, dispatch } = view;
              const permalinkNodeType = state.schema.nodes.permalinkNode;
              if (!permalinkNodeType) {
                console.warn('PermalinkNode type not found in schema.');
                return false;
              }

              const node = permalinkNodeType.create({
                permalink: pastedText,
                isLoading: true
              });

              dispatch(state.tr.replaceSelectionWith(node));
              return true;
            } else {
              return false;
            }
          }
        }
      })
    ];
  }
});
