import type {GitProvider} from "./provider.js"
import {IsomorphicGitProvider} from "./isomorphic-git-provider.js"
import {CachedGitProvider} from "./cached-provider.js"
import {loadConfig, type GitWrapperConfig} from "./config.js"
import httpWeb from "isomorphic-git/http/web"
import LightningFS from "@isomorphic-git/lightning-fs"

let singleton: GitProvider | null = null

export function getGitProvider(overrides?: Partial<GitWrapperConfig>): GitProvider {
  if (singleton) return singleton

  const cfg = loadConfig(overrides)

  const fs = new LightningFS("nostr-git")
  const http = httpWeb
  const provider = new IsomorphicGitProvider({
    fs,
    http,
    corsProxy: cfg.defaultCorsProxy ?? "https://cors.isomorphic-git.org",
  })

  if (cfg.cacheMode === "off") {
    singleton = provider
    return provider
  }

  singleton = new CachedGitProvider(provider, cfg)
  return singleton
}
