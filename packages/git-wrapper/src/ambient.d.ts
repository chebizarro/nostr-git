declare module 'isomorphic-git' {
  const isogit: any;
  export = isogit;
}

declare module 'isomorphic-git/http/web' {
  const httpClient: any;
  export default httpClient;
}

declare module 'isomorphic-git/http/node' {
  const httpClient: any;
  export default httpClient;
}

// LightningFS has no bundled types in some distributions; provide a minimal ambient declaration
declare module '@isomorphic-git/lightning-fs' {
  const LightningFS: any;
  export default LightningFS;
}
