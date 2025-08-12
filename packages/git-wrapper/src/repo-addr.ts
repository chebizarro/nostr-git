import { GIT_REPO_ANNOUNCEMENT } from '@nostr-git/shared-types';

export function makeRepoAddr(pubkey: string, repoId: string) {
  return `${GIT_REPO_ANNOUNCEMENT}:${pubkey}:${repoId}`;
}

export function isRepoAddr(addr: string) {
  return new RegExp(`^${GIT_REPO_ANNOUNCEMENT}:[0-9a-fA-F]{64}:.+`).test(addr);
}
