export interface RepoAnnouncement {
  id: string
  repoId: string
  address: string
  name?: string
  owner: string // pubkey
  description?: string
  web?: string[]
  clone?: string[]
  identifier: string // for backward compatibility
  pubkey: string // for backward compatibility
}

export function parseRepoEvent(event: any): RepoAnnouncement {
  if (event.kind !== 30617) {
    throw new Error(`Expected kind 30617, got ${event.kind}`)
  }

  const tags = new Map<string, string[]>()
  for (const tag of event.tags) {
    if (tag.length < 2) continue
    const [key, ...values] = tag
    tags.set(key, values)
  }

  const name = tags.get("name")?.[0]
  const web = tags.get("web") || []
  const clone = tags.get("clone") || []
  const identifier = tags.get("d")?.[0]

  if (!name || !identifier) {
    throw new Error("Missing required tags: name or d")
  }

  return {
    id: event.id,
    repoId: identifier,
    address: "",
    name,
    owner: event.pubkey,
    description: tags.get("description")?.[0],
    web,
    clone,
    identifier,
    pubkey: event.pubkey,
  }
}
