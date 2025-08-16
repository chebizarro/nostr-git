/**
 * Codemod: Replace direct event.tags.find/filter with canonical helpers
 *
 * Usage (from repo root):
 *  pnpm dlx jscodeshift -t tools/codemods/tag-helpers/transform.js "packages/**/src/**/*.{ts,tsx,js,jsx}"
 *
 * Notes:
 * - Only transforms simple literal-tag-name cases, e.g. tag => tag[0] === 'x'
 * - Leaves complex/dynamic cases with a TODO comment for manual follow-up
 */

export default function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  function ensureImport() {
    // Add: import { getTag, getTags } from '@nostr-git/shared-types';
    const imports = root.find(j.ImportDeclaration, {
      source: { value: '@nostr-git/shared-types' }
    });
    if (imports.size() === 0) {
      const newImport = j.importDeclaration(
        [j.importSpecifier(j.identifier('getTag')), j.importSpecifier(j.identifier('getTags'))],
        j.literal('@nostr-git/shared-types')
      );
      const firstImport = root.find(j.ImportDeclaration).at(0);
      if (firstImport.size()) firstImport.insertBefore(newImport);
      else root.get().node.program.body.unshift(newImport);
    } else {
      imports.forEach(path => {
        const specifiers = path.value.specifiers || [];
        const names = specifiers.map(s => s.imported && s.imported.name);
        const needed = [];
        if (!names.includes('getTag')) needed.push(j.importSpecifier(j.identifier('getTag')));
        if (!names.includes('getTags')) needed.push(j.importSpecifier(j.identifier('getTags')));
        if (needed.length) path.value.specifiers = [...specifiers, ...needed];
      });
    }
  }

  // Replace event.tags.find( t => t[0] === 'x' ) => getTag(event, 'x')
  root.find(j.CallExpression, {
    callee: {
      type: 'MemberExpression',
      property: { name: 'find' },
      object: { type: 'MemberExpression', property: { name: 'tags' } }
    }
  }).forEach(path => {
    const [arg] = path.value.arguments;
    if (!arg || (arg.type !== 'ArrowFunctionExpression' && arg.type !== 'FunctionExpression')) return;
    // Match: param => param[0] ==/=== 'literal'
    const p = arg.params[0];
    const body = arg.type === 'ArrowFunctionExpression' ? arg.body : arg.body && arg.body.type === 'BlockStatement'
      ? (arg.body.body.find(n => n.type === 'ReturnStatement') || {}).argument
      : null;
    if (
      p && p.type === 'Identifier' &&
      body && body.type === 'BinaryExpression' && /^(==|===)$/.test(body.operator) &&
      ((body.left.type === 'MemberExpression' && body.left.object.name === p.name && body.left.property.value === 0 && body.left.computed) ||
        (body.right.type === 'MemberExpression' && body.right.object.name === p.name && body.right.property.value === 0 && body.right.computed))
    ) {
      const literalSide = body.left.type === 'Literal' ? body.left : body.right.type === 'Literal' ? body.right : null;
      const memberSide = body.left.type === 'MemberExpression' ? body.left : body.right.type === 'MemberExpression' ? body.right : null;
      const tagLiteral = literalSide && typeof literalSide.value === 'string' ? literalSide.value : null;
      if (memberSide && tagLiteral) {
        // Derive the event object from the original callee object (event.tags.find -> event)
        const eventObj = path.value.callee.object.object;
        ensureImport();
        j(path).replaceWith(
          j.callExpression(j.identifier('getTag'), [eventObj, j.literal(tagLiteral)])
        );
      } else {
        j(path).replaceWith(
          j.callExpression(j.identifier('/* TODO manual: use getTag */ (x => x)'), [path.value])
        );
      }
    }
  });

  // Replace event.tags.filter( t => t[0] === 'x' ) => getTags(event, 'x')
  root.find(j.CallExpression, {
    callee: {
      type: 'MemberExpression',
      property: { name: 'filter' },
      object: { type: 'MemberExpression', property: { name: 'tags' } }
    }
  }).forEach(path => {
    const [arg] = path.value.arguments;
    if (!arg || (arg.type !== 'ArrowFunctionExpression' && arg.type !== 'FunctionExpression')) return;
    const p = arg.params[0];
    const body = arg.type === 'ArrowFunctionExpression' ? arg.body : arg.body && arg.body.type === 'BlockStatement'
      ? (arg.body.body.find(n => n.type === 'ReturnStatement') || {}).argument
      : null;
    if (
      p && p.type === 'Identifier' &&
      body && body.type === 'BinaryExpression' && /^(==|===)$/.test(body.operator) &&
      ((body.left.type === 'MemberExpression' && body.left.object.name === p.name && body.left.property.value === 0 && body.left.computed) ||
        (body.right.type === 'MemberExpression' && body.right.object.name === p.name && body.right.property.value === 0 && body.right.computed))
    ) {
      const literalSide = body.left.type === 'Literal' ? body.left : body.right.type === 'Literal' ? body.right : null;
      const memberSide = body.left.type === 'MemberExpression' ? body.left : body.right.type === 'MemberExpression' ? body.right : null;
      const tagLiteral = literalSide && typeof literalSide.value === 'string' ? literalSide.value : null;
      if (memberSide && tagLiteral) {
        const eventObj = path.value.callee.object.object;
        ensureImport();
        j(path).replaceWith(
          j.callExpression(j.identifier('getTags'), [eventObj, j.literal(tagLiteral)])
        );
      } else {
        j(path).replaceWith(
          j.callExpression(j.identifier('/* TODO manual: use getTags */ (x => x)'), [path.value])
        );
      }
    }
  });

  return root.toSource({ quote: 'single' });
}
