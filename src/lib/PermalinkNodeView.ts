import type { NodeViewProps } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';

export const PermalinkNodeView = ({ node }: NodeViewProps) => {
  const dom = document.createElement('div');
  dom.classList.add('tiptap-nevent-wrapper');

  function render() {
    dom.innerHTML = ''; 

    const label = document.createElement('span');
    label.classList.add('nevent-label');
    label.contentEditable = 'false';

    if (node.attrs.kind === 1623) {
      label.textContent = `Permalink (kind=1623): nostr:${node.attrs.bech32}`;
      dom.classList.add('is-permalink');
    } else {
      label.textContent = `Nostr event: nostr:${node.attrs.bech32}`;
      dom.classList.remove('is-permalink');
    }

    dom.appendChild(label);
  }

  render();

  return {
    dom,
    update(updatedNode: Node) {
      if (updatedNode.type.name !== node.type.name) return false;

      node = updatedNode;
      render();
      return true;
    },

    destroy() {
    }
  };
};
