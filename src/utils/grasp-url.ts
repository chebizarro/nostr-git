import {nip19} from "nostr-tools"
import {normalizeRelayUrl} from "./sanitize-relays.js"

export interface ParsedGraspRepoHttpUrl {
  ownerNpub: string
  identifier: string
  httpBase: string
}

export interface GraspRepoCloneTarget {
  relayUrl: string
  ownerPubkey: string
  identifier: string
  httpBaseAliases?: readonly string[]
}

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl)
  } catch {
    return null
  }
}

function isValidNpub(value: string): boolean {
  try {
    const decoded = nip19.decode(value)
    return decoded.type === "npub" && typeof decoded.data === "string"
  } catch {
    return false
  }
}

function normalizePubkey(value: string): string {
  const trimmed = String(value || "").trim()
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase()
  try {
    const decoded = nip19.decode(trimmed)
    return decoded.type === "npub" && typeof decoded.data === "string"
      ? decoded.data.toLowerCase()
      : ""
  } catch {
    return ""
  }
}

export function normalizeGraspServiceHttpBase(rawUrl: string): string {
  const relayUrl = normalizeGraspServiceRelayUrl(rawUrl)
  return relayUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:")
}

export function normalizeGraspServiceRelayUrl(rawUrl: string): string {
  try {
    return normalizeRelayUrl(
      rawUrl
        .trim()
        .replace(/^http:/i, "ws:")
        .replace(/^https:/i, "wss:"),
    )
  } catch {
    return ""
  }
}

export function appendGraspHttpPath(baseUrl: string, path: string): string {
  const queryStart = baseUrl.indexOf("?")
  const endpoint = queryStart === -1 ? baseUrl : baseUrl.slice(0, queryStart)
  const baseQuery = queryStart === -1 ? "" : baseUrl.slice(queryStart + 1)
  const pathQueryStart = path.indexOf("?")
  const pathname = pathQueryStart === -1 ? path : path.slice(0, pathQueryStart)
  const pathQuery = pathQueryStart === -1 ? "" : path.slice(pathQueryStart + 1)
  const query = [baseQuery, pathQuery].filter(Boolean).join("&")
  return `${endpoint.replace(/\/+$/, "")}/${pathname.replace(/^\/+/, "")}${query ? `?${query}` : ""}`
}

export function parseGraspRepoHttpUrl(rawUrl: string): ParsedGraspRepoHttpUrl | null {
  if (!rawUrl) return null

  const url = parseUrl(rawUrl)
  if (!url) return null

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null
  }
  if (url.hash) return null

  const segments = url.pathname.split("/").filter(Boolean)
  if (segments.length < 2) return null

  const repoSegment = segments[segments.length - 1]
  const ownerSegment = segments[segments.length - 2]

  if (!repoSegment.endsWith(".git")) return null

  if (!isValidNpub(ownerSegment)) return null

  let identifier: string
  try {
    identifier = decodeURIComponent(repoSegment.slice(0, -4))
  } catch {
    return null
  }
  if (
    !identifier ||
    identifier === "." ||
    identifier === ".." ||
    identifier.includes("/") ||
    identifier.includes("\\") ||
    identifier.includes("\0")
  ) {
    return null
  }

  const prefix = segments.slice(0, -2).join("/")
  const httpBase = `${url.origin}${prefix ? `/${prefix}` : "/"}${url.search}`

  return {
    ownerNpub: ownerSegment,
    identifier,
    httpBase,
  }
}

export function isGraspRepoHttpUrl(rawUrl: string): boolean {
  return parseGraspRepoHttpUrl(rawUrl) !== null
}

export function findMatchingGraspRepoCloneUrl(
  cloneUrls: readonly string[],
  target: GraspRepoCloneTarget,
): {url: string; parsed: ParsedGraspRepoHttpUrl} | null {
  const ownerPubkey = normalizePubkey(target.ownerPubkey)
  if (!ownerPubkey || !target.identifier) return null

  const httpBases = new Set(
    [target.relayUrl, ...(target.httpBaseAliases || [])]
      .map(normalizeGraspServiceHttpBase)
      .filter(Boolean),
  )
  if (httpBases.size === 0) return null

  for (const rawUrl of cloneUrls) {
    const parsed = parseGraspRepoHttpUrl(rawUrl)
    if (!parsed) continue
    if (parsed.identifier !== target.identifier) continue
    if (normalizePubkey(parsed.ownerNpub) !== ownerPubkey) continue
    if (!httpBases.has(normalizeGraspServiceHttpBase(parsed.httpBase))) continue
    return {url: rawUrl, parsed}
  }

  return null
}

export function hasMatchingGraspRepoCloneUrl(
  cloneUrls: readonly string[],
  target: GraspRepoCloneTarget,
): boolean {
  return findMatchingGraspRepoCloneUrl(cloneUrls, target) !== null
}

export function isGraspRelayUrl(rawUrl: string): boolean {
  if (!rawUrl) return false
  const url = parseUrl(rawUrl)
  if (!url) return false

  return (
    (url.protocol === "ws:" || url.protocol === "wss:") &&
    (url.pathname === "" || url.pathname === "/")
  )
}

export function resolveCorsProxyForUrl(
  rawUrl: string,
  fallback?: string | null,
): string | null | undefined {
  if (isGraspRepoHttpUrl(rawUrl)) {
    return null
  }

  return fallback
}
