import type { GitProvider } from './provider.js';

export type CacheMode = 'off' | 'per-session' | 'per-repo-batch';

export interface GitWrapperConfig {
  compatMode: boolean; // maps to LIBGIT2_COMPAT
  cacheMode: CacheMode;
  cacheMaxAgeMs: number; // TTL/idle expiry for per-session caches
}

const defaultConfig: GitWrapperConfig = {
  compatMode: false,
  cacheMode: 'per-session',
  cacheMaxAgeMs: 60_000, // 60s idle TTL by default
};

function loadDotEnvIfAvailable() {
  if (typeof window !== 'undefined') return; // browser/extension: no dotenv
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dotenv = require('dotenv');
    if (dotenv?.config) dotenv.config();
  } catch {
    // dotenv not available; ignore
  }
}

export function loadConfig(overrides?: Partial<GitWrapperConfig>): GitWrapperConfig {
  loadDotEnvIfAvailable();
  const env = (typeof process !== 'undefined' && process.env) ? process.env : {} as any;

  const compatMode = Boolean(
    overrides?.compatMode ?? (env.LIBGIT2_COMPAT === 'true' || env.LIBGIT2_COMPAT === '1')
  );

  const cacheMode = (overrides?.cacheMode ?? (env.GIT_CACHE_MODE as CacheMode)) || defaultConfig.cacheMode;

  const cacheMaxAgeMs = overrides?.cacheMaxAgeMs ?? (env.GIT_CACHE_TTL_MS ? Number(env.GIT_CACHE_TTL_MS) : defaultConfig.cacheMaxAgeMs);

  return { compatMode, cacheMode, cacheMaxAgeMs };
}

export type { GitProvider };
