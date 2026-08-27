// Read-time protection: validate and sanitize relay URLs coming from events or params
const isValidNostrRelayUrl = (url: string): boolean => {
  try {
    const u = new URL(url)
    if (!(u.protocol === "ws:" || u.protocol === "wss:")) return false
    if (isLikelyGitRemotePath(u.pathname)) return false
    const host = u.hostname.toLowerCase()
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true
    if (host === "container") return false
    if (isKnownGitPlatformHost(host)) return false
    return host.includes(".")
  } catch {
    return false
  }
}

function isKnownGitPlatformHost(host: string): boolean {
  const normalized = String(host || "").toLowerCase()
  return (
    normalized === "github.com" || normalized === "gitlab.com" || normalized === "bitbucket.org"
  )
}

function isLikelyGitRemotePath(pathname: string): boolean {
  const segments = String(pathname || "")
    .split("/")
    .filter(Boolean)
  const lastSegment = segments[segments.length - 1] || ""
  return segments.length >= 2 && /\.git$/i.test(lastSegment)
}

function isLikelyNonRelayInput(input: string): boolean {
  const raw = String(input || "").trim()
  if (!raw) return false

  let parsed: URL
  try {
    parsed = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`)
  } catch {
    return false
  }

  const host = parsed.hostname.toLowerCase()
  if (isLikelyGitRemotePath(parsed.pathname)) return true
  return isKnownGitPlatformHost(host)
}

function isOnionHost(host: string | null | undefined): boolean {
  if (!host) return false
  const authority = host.toLowerCase().split(/[/?#]/, 1)[0]
  const hostname = authority.startsWith("[")
    ? authority.slice(0, authority.indexOf("]") + 1)
    : authority.split(":", 1)[0]
  return hostname.endsWith(".onion")
}

export function normalizeRelayUrl(input: string): string {
  if (typeof input !== "string" || !input) throw new TypeError("Invalid relay URL")

  const schemeMatch = input.match(/^([a-z][a-z\d+.-]*):\/\//i)
  const candidate = schemeMatch
    ? input
    : `${isOnionHost(input.toLowerCase()) ? "ws" : "wss"}://${input}`
  const parsed = new URL(candidate)

  if (
    !/^wss?:$/.test(parsed.protocol) ||
    !parsed.hostname ||
    (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") ||
    parsed.username ||
    parsed.password
  ) {
    throw new TypeError("Invalid relay URL")
  }

  // Keep this compatibility implementation aligned with Welshman: only the
  // authority is canonicalized; path and query bytes remain endpoint identity.
  const rawAfterScheme = candidate.slice(candidate.indexOf("://") + 3)
  const suffixStart = rawAfterScheme.search(/[/?#]/)
  const rawSuffix = suffixStart === -1 ? "" : rawAfterScheme.slice(suffixStart)
  const suffixWithoutFragment = rawSuffix.split("#", 1)[0]
  const pathAndQuery =
    !suffixWithoutFragment || suffixWithoutFragment.startsWith("?")
      ? `/${suffixWithoutFragment}`
      : suffixWithoutFragment

  return `${parsed.protocol}//${parsed.host}${pathAndQuery}`
}

export const sanitizeRelays = (urls: string[]): string[] => {
  const out: string[] = []
  const seen = new Set<string>()
  for (const url of urls || []) {
    try {
      const raw = String(url || "").trim()
      if (isLikelyNonRelayInput(raw)) continue
      const normalized = normalizeRelayUrl(raw)
      if (isLikelyNonRelayInput(normalized)) continue
      if (!isValidNostrRelayUrl(normalized)) continue
      if (seen.has(normalized)) continue
      seen.add(normalized)
      out.push(normalized)
    } catch {
      // skip
    }
  }
  return out
}

// Local/loopback relays may be valid publish targets during development, but
// they must never be embedded as relay hints in shareable entities
// (nevent/naddr): nobody else can reach them.
const isLocalRelayUrl = (url: string): boolean => {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".local") ||
      host.endsWith(".localhost")
    )
  } catch {
    return true
  }
}

// Sanitize relay URLs for inclusion as hints in shared entities (naddr/nevent)
export const shareableRelays = (urls: string[]): string[] =>
  sanitizeRelays(urls).filter(url => !isLocalRelayUrl(url))
