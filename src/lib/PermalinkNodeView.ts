import { mergeAttributes, Node, nodePasteRule, type PasteRuleMatch } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { createNeventFromPermalink } from './event.js';
import type { EventTemplate, NostrEvent } from 'nostr-tools';
import type { MarkdownSerializerState } from '@tiptap/pm/markdown';

const PERMALINK_REGEX = /https?:\/\/(?:github\.com|gitlab\.com|gitea\.com)\/\S+/gi;

const createPasteRuleMatch = <T extends Record<string, unknown>>(
  match: RegExpMatchArray,
  data: T
): PasteRuleMatch => ({ index: match.index!, replaceWith: match[2], text: match[0], match, data });

interface PermalinkNodeAttrs {
  permalink?: string;
  nevent?: string;
  error?: string;
}

export interface PermalinkNodeOptions {
  signer: (event: EventTemplate) => Promise<NostrEvent>;
  relays: string[];
}

export const PermalinkNode = Node.create<PermalinkNodeOptions>({
  name: 'permalinkNode',

  group: 'block',

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      permalink: { default: null },
      nevent: { default: '' }
    };
  },

  addOptions() {
    return {
      signer: window.nostr.signEvent,
      relays: ['wss://relay.damus.io']
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': this.name })];
  },

  renderText({ node }) {
    const { nevent, permalink } = node.attrs;
    return nevent || permalink || '';
  },

  parseHTML() {
    return [{ tag: `div[data-type="${this.name}"]` }];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          const { nevent } = node.attrs;
          state.write(nevent || '');
        },
        parse: {}
      }
    };
  },

  addCommands() {
    return {
      insertPermalink:
        (url: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              permalink: url,
              nevent: null
            }
          });
        }
    };
  },

  addPasteRules() {
    return [
      nodePasteRule({
        type: this.type,
        find: (text) => {
          const matches = [];
          for (const match of text.matchAll(PERMALINK_REGEX)) {
            const rawLink = match[0];
            matches.push(createPasteRuleMatch(match, { permalink: rawLink }));
          }
          return matches;
        },
        getAttributes: (match) => match.data
      })
    ];
  },

  addNodeView() {
    return ({ editor, node, getPos }) => {
      let currentNode = node;

      const dom = document.createElement('div');
      dom.classList.add('permalink-node');

      function render() {
        const { nevent, permalink } = currentNode.attrs;
        dom.innerHTML = '';

        if (nevent) {
		  const bech32 = nevent.replace(/^nostr:/, '')
          const shortNevent = bech32.slice(0, 16) + (bech32.length > 16 ? '…' : '');
          dom.textContent = shortNevent;
        } else if (permalink) {
          dom.textContent = `Loading event for: ${permalink}`;
		} else if (currentNode.attrs.error) {
		  dom.textContent = `Error: ${currentNode.attrs.error}`;
        } else {
          dom.textContent = '(No link?)';
        }
      }

      function updateNode(attrs: Partial<PermalinkNodeAttrs>) {
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...currentNode.attrs,
            ...attrs
          })
        );
      }

      async function maybeFetch(options: PermalinkNodeOptions) {
        if (!currentNode.attrs.nevent && currentNode.attrs.permalink) {
          try {
            const nevent = await createNeventFromPermalink(
              currentNode.attrs.permalink,
              options.signer,
              options.relays
            );
            updateNode({ nevent });
          } catch (err) {
            updateNode({ error: `(Error: ${String(err)})` });
          }
        }
      }

      render();
      maybeFetch(this.options);

      return {
        dom,
        update(updatedNode) {
          if (updatedNode.type.name !== currentNode.type.name) return false;
          currentNode = updatedNode;
          render();
          return true;
        }
      };
    };
  }
});
