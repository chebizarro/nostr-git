import type {GitProvider} from "./provider.js"

export type CacheMode = "off" | "per-session" | "per-repo-batch"

export interface GitWrapperConfig {
  compatMode: boolean // maps to LIBGIT2_COMPAT
  cacheMode: CacheMode
  cacheMaxAgeMs: number // TTL/idle expiry for per-session caches
}

const defaultConfig: GitWrapperConfig = {
  compatMode: false,
  cacheMode: "per-session",
  cacheMaxAgeMs: 60_000, // 60s idle TTL by default
}

export function loadConfig(overrides?: Partial<GitWrapperConfig>): GitWrapperConfig {
  // Read from process.env if available (ambient declaration provided for portability)
  const env =
    typeof process !== "undefined" && (process as any).env ? (process as any).env : ({} as any)

  const compatMode = Boolean(
    overrides?.compatMode ?? (env.LIBGIT2_COMPAT === "true" || env.LIBGIT2_COMPAT === "1"),
  )

  const cacheMode =
    (overrides?.cacheMode ?? (env.GIT_CACHE_MODE as CacheMode)) || defaultConfig.cacheMode

  const cacheMaxAgeMs =
    overrides?.cacheMaxAgeMs ??
    (env.GIT_CACHE_TTL_MS ? Number(env.GIT_CACHE_TTL_MS) : defaultConfig.cacheMaxAgeMs)

  return {compatMode, cacheMode, cacheMaxAgeMs}
}

export type {GitProvider}
