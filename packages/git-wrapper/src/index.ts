export * from "./provider.js"
// Keep adapter internal to avoid test bundlers resolving external 'isomorphic-git' when importing this package.
// export * from './isomorphic-git-provider.js';
export * from "./cached-provider.js"
export * from "./config.js"
// Factory is provided via split entrypoints:
// - index.web.ts -> exports from './factory.web.js' for browser
// - index.node.ts -> exports from './factory.node.js' for node/SSR
