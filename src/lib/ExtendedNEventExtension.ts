import { NEventExtension } from 'nostr-editor';

export const ExtendedNEventExtension = NEventExtension.extend({
  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const dom = document.createElement('div');
      dom.classList.add('tiptap-nevent-wrapper');
      Object.assign(dom, HTMLAttributes);

      function render() {
        dom.innerHTML = '';

        const label = document.createElement('span');
        label.classList.add('nevent-label');
        label.contentEditable = 'false'; // This ensures it’s non-editable

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
        // contentDOM: content, // (Uncomment if you need an editable region)

        update(updatedNode) {
          if (updatedNode.type.name !== node.type.name) return false;

          // store updated node
          node = updatedNode;
          // re-render with new attributes
          render();

          return true;
        },

        destroy() {}
      };
    };
  }
});
