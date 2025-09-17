export interface ProtocolPrefsStore {
  get(repoId: string): string | undefined
  set(repoId: string, url: string): void
}

export class MemoryProtocolPrefs implements ProtocolPrefsStore {
  private m = new Map<string, string>()
  get(id: string) {
    return this.m.get(id)
  }
  set(id: string, url: string) {
    this.m.set(id, url)
  }
}

// Node-friendly JSON file store (best-effort, no concurrency control)
export class FileProtocolPrefs implements ProtocolPrefsStore {
  constructor(
    private fs: any,
    private filePath: string,
  ) {}
  private readAll(): Record<string, string> {
    try {
      if (this.fs.existsSync(this.filePath)) {
        const raw = this.fs.readFileSync(this.filePath, "utf8")
        return JSON.parse(raw || "{}") as Record<string, string>
      }
    } catch {}
    return {}
  }
  private writeAll(obj: Record<string, string>) {
    try {
      const dir = this.filePath.split("/").slice(0, -1).join("/") || "."
      if (!this.fs.existsSync(dir)) this.fs.mkdirSync(dir, {recursive: true})
      this.fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2))
    } catch {}
  }
  get(id: string) {
    return this.readAll()[id]
  }
  set(id: string, url: string) {
    const all = this.readAll()
    all[id] = url
    this.writeAll(all)
  }
}

// Browser-friendly localStorage store
export class LocalStorageProtocolPrefs implements ProtocolPrefsStore {
  constructor(
    private storage: Storage,
    private prefix = "ngit:prefs:",
  ) {}
  get(id: string) {
    return this.storage.getItem(this.prefix + id) || undefined
  }
  set(id: string, url: string) {
    this.storage.setItem(this.prefix + id, url)
  }
}
