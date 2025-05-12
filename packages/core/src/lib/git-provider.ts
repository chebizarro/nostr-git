import type { GitProvider } from '@nostr-git/git-wrapper';
import { IsomorphicGitProvider } from '@nostr-git/git-wrapper';

let gitProvider: GitProvider = new IsomorphicGitProvider();

export function setGitProvider(provider: GitProvider) {
  gitProvider = provider;
}

export function getGitProvider(): GitProvider {
  return gitProvider;
}
