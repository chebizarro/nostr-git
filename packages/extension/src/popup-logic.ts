export function normalizeRelays(lines: string[]): {relays: string[]; invalid: string[]} {
  const out: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  for (const raw of lines) {
    const s = raw.trim()
    if (!s) continue
    // allow ws:// or wss:// only
    if (!/^wss?:\/\//i.test(s)) {
      invalid.push(s)
      continue
    }
    // strip trailing slash
    const url = s.replace(/\/$/, "")
    const low = url.toLowerCase()
    if (!seen.has(low)) {
      seen.add(low)
      out.push(url)
    }
  }
  return {relays: out, invalid}
}

export function normalizeViewerBase(input: string): string {
  const raw = (input || "").trim()
  let url = raw || ""
  if (!/^(https?:)\/\//i.test(url)) {
    url = url ? `https://${url}` : ""
  }
  if (!url) throw new Error("empty")
  const u = new URL(url)
  // ensure trailing slash
  if (!u.pathname.endsWith("/")) {
    u.pathname = `${u.pathname}/`
  }
  return u.toString()
}
