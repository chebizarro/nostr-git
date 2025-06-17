import type { GitProvider } from '@nostr-git/git-wrapper';
import { IsomorphicGitProvider } from '@nostr-git/git-wrapper';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';

let gitProvider: GitProvider = new IsomorphicGitProvider({
  fs: new LightningFS('nostr-git'),
  http: http,
  corsProxy: 'https://cors.isomorphic-git.org',
});

export function setGitProvider(provider: GitProvider) {
  gitProvider = provider;
}

export function getGitProvider(): GitProvider {
  return gitProvider;
}
