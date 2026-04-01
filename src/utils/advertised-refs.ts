export type AdvertisedServerRef = {
  ref?: string
  oid?: string
  target?: string
  symref?: string
  value?: string
}

export type AdvertisedRefsSummary = {
  refs: AdvertisedServerRef[]
  branches: string[]
  tags: string[]
  headBranch: string | null
  hasRemoteHead: boolean
}

const normalizeHeadRef = (value: unknown): string => {
  const raw = String(value || "")
  return raw.startsWith("ref: ") ? raw.slice("ref: ".length) : raw
}

export const parseAdvertisedHeadBranch = (refs: AdvertisedServerRef[]): string | null => {
  const headEntry = refs.find(ref => String(ref?.ref || "") === "HEAD")
  const directCandidates = [headEntry?.target, headEntry?.symref, headEntry?.value]

  for (const candidate of directCandidates) {
    const normalized = normalizeHeadRef(candidate)
    if (normalized.startsWith("refs/heads/")) {
      return normalized.slice("refs/heads/".length)
    }
  }

  const headOid = String(headEntry?.oid || "")
  if (!headOid) return null

  const matchingBranches = refs
    .filter(ref => String(ref?.ref || "").startsWith("refs/heads/"))
    .filter(ref => String(ref?.oid || "") === headOid)
    .map(ref => String(ref.ref).slice("refs/heads/".length))

  return matchingBranches.length === 1 ? matchingBranches[0] : null
}

export const summarizeAdvertisedRefs = (refs: AdvertisedServerRef[]): AdvertisedRefsSummary => {
  const branches = Array.from(
    new Set(
      refs
        .map(ref => String(ref?.ref || ""))
        .filter(ref => ref.startsWith("refs/heads/"))
        .map(ref => ref.slice("refs/heads/".length))
        .filter(Boolean),
    ),
  )

  const tags = Array.from(
    new Set(
      refs
        .map(ref => String(ref?.ref || ""))
        .filter(ref => ref.startsWith("refs/tags/"))
        .map(ref => ref.slice("refs/tags/".length))
        .filter(name => Boolean(name && !name.endsWith("^{}"))),
    ),
  )

  const headBranch = parseAdvertisedHeadBranch(refs)

  return {
    refs,
    branches,
    tags,
    headBranch,
    hasRemoteHead: Boolean(headBranch),
  }
}

export const buildAdvertisedBranchCandidates = ({
  requestedBranch,
  headBranch,
  branches = [],
  fallbackBranches = ["main", "master", "develop", "dev"],
}: {
  requestedBranch?: string | null
  headBranch?: string | null
  branches?: string[]
  fallbackBranches?: string[]
}): string[] =>
  Array.from(
    new Set(
      [requestedBranch, headBranch, ...branches, ...fallbackBranches]
        .map(branch => String(branch || "").trim())
        .filter(Boolean),
    ),
  )

export async function discoverAdvertisedRefs(
  git: any,
  opts: {url: string; onAuth?: any; corsProxy?: string | null},
): Promise<AdvertisedRefsSummary> {
  if (typeof git?.listServerRefs !== "function") {
    return summarizeAdvertisedRefs([])
  }

  const refs = await git.listServerRefs({
    url: opts.url,
    symrefs: true,
    ...(opts.onAuth ? {onAuth: opts.onAuth} : {}),
    ...(opts.corsProxy !== undefined ? {corsProxy: opts.corsProxy} : {}),
  })

  return summarizeAdvertisedRefs(Array.isArray(refs) ? refs : [])
}
