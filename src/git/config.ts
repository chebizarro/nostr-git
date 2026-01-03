export type CacheMode = "off" | "per-session" | "per-repo-batch"

export interface GitWrapperConfig {
  compatMode: boolean
  cacheMode: CacheMode
  cacheMaxAgeMs: number
  defaultCorsProxy?: string | null
}

const defaultConfig: GitWrapperConfig = {
  compatMode: false,
  cacheMode: "per-session",
  cacheMaxAgeMs: 60_000, // 60s idle TTL by default
}

export function loadConfig(overrides?: Partial<GitWrapperConfig>): GitWrapperConfig {
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

  // New: read default CORS proxy configuration
  const defaultCorsProxyEnv = env.GIT_DEFAULT_CORS_PROXY
  const defaultCorsProxy =
    defaultCorsProxyEnv === "none"
      ? null
      : defaultCorsProxyEnv ?? "https://corsproxy.budabit.club"

  return { compatMode, cacheMode, cacheMaxAgeMs, defaultCorsProxy }
}
