import type { GitProvider } from './provider.js';
import { IsomorphicGitProvider } from './isomorphic-git-provider.js';
import { CachedGitProvider } from './cached-provider.js';
import { loadConfig, type GitWrapperConfig } from './config.js';
import * as fsNode from 'fs';
import httpNode from 'isomorphic-git/http/node';
import httpWeb from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';

let singleton: GitProvider | null = null;

export function getGitProvider(overrides?: Partial<GitWrapperConfig>): GitProvider {
  if (singleton) return singleton;

  const cfg = loadConfig(overrides);

  // Note: compatMode is consumed by isomorphic-git v2 via process.env (dotenv-loaded).
  // We don't branch code here; we just ensure env is loaded in config.
  const isBrowserLike = typeof window !== 'undefined' && typeof (globalThis as any).indexedDB !== 'undefined';
  const fs = isBrowserLike ? new LightningFS('nostr-git') : fsNode;
  const http = isBrowserLike ? httpWeb : httpNode;
  const provider = new IsomorphicGitProvider({ fs, http, corsProxy: 'https://cors.isomorphic-git.org' });

  if (cfg.cacheMode === 'off') {
    singleton = provider;
    return provider;
  }

  singleton = new CachedGitProvider(provider, cfg);
  return singleton;
}
