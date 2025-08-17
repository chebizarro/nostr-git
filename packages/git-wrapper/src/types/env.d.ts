// Minimal ambient declarations to avoid requiring @types/node in this package
// This keeps git-wrapper portable across browser and Node builds.

declare const process: { env?: Record<string, string | undefined> } | undefined;

declare module 'fs' {
  const anyFs: any;
  export = anyFs;
}

declare module 'isomorphic-git/http/node' {
  const http: any;
  export default http;
}
