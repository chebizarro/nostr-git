import type { GitProvider } from './provider.js';
import { IsomorphicGitProvider } from './isomorphic-git-provider.js';
import { CachedGitProvider } from './cached-provider.js';
import { loadConfig, type GitWrapperConfig } from './config.js';
import * as fsNode from 'fs';
import httpNode from 'isomorphic-git/http/node';

let singleton: GitProvider | null = null;

export function getGitProvider(overrides?: Partial<GitWrapperConfig>): GitProvider {
  if (singleton) return singleton;

  const cfg = loadConfig(overrides);

  const fs = fsNode;
  const http = httpNode;
  const provider = new IsomorphicGitProvider({ fs, http, corsProxy: 'https://cors.isomorphic-git.org' });

  if (cfg.cacheMode === 'off') {
    singleton = provider;
    return provider;
  }

  singleton = new CachedGitProvider(provider, cfg);
  return singleton;
}
