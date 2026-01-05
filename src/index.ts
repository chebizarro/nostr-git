/**
 * Root package barrel for the single-package npm distribution.
 *
 * - Namespaced exports: import * as events from "nostr-git"; events.createPatchEvent(...)
 * - Convenience exports: import { createPatchEvent } from "nostr-git"
 */

export * as events from "./events/index.js";
export * as git from "./git/index.js";
export * as types from "./types/index.js";
export * as api from "./api/index.js";
export * as worker from "./worker/index.js";

// Convenience top-level exports
export { createRepoStateEvent, createRepoAnnouncementEvent } from "./events/index.js";
export { getGitProvider } from "./git/factory.js";
export { initializeNostrGitProvider } from "./api/git-provider.js";
export { getGitWorker, configureWorkerEventIO } from "./worker/client.js";
export * from "./utils/sanitize-relays.js";