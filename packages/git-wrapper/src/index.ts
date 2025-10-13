/**
 * Main entry point for Git provider interfaces and configuration.
 *
 * GRASP integration exports:
 *  - `GraspLike`: Minimal interface for injecting a GraspApi instance into
 *    providers like NostrGitProvider.
 *  - `HttpOverrides`: Options for per-call proxy control, allowing GRASP relay
 *    endpoints to bypass the default CORS proxy when appropriate.
 */

export * from "./provider.js"
export * from "./cached-provider.js"
export * from "./config.js"
export * from "./nostr-url.js"
export * from "./nip05.js"
export * from "./git-utils.js"
export * from "./factory.node.js"

/**
 * Minimal lightweight interface representing the required GRASP API methods.
 * Defined locally to avoid requiring a hard dependency on @nostr-git/core.
 */
export interface GraspLike {
  getCapabilities(): Promise<any>
  getRelayInfo(): Promise<any>
  publishStateFromLocal(
    owner: string,
    repo: string,
    opts?: { includeTags?: boolean; prevEventId?: string }
  ): Promise<any>
}

export type { HttpOverrides } from "./provider.js"
// Factory is provided via split entrypoints:
// - index.web.ts -> exports from './factory.web.js' for browser
// - index.node.ts -> exports from './factory.node.js' for node/SSR
