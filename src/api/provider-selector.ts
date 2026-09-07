import {isGraspRepoHttpUrl} from "../utils/grasp-url.js"
import {
  ENABLE_DIRECT_NOSTR_GIT_PROVIDER,
  assertDirectNostrGitProviderEnabled,
} from "../git/provider-policy.js"

export function selectProvider(
  url: string,
  options: {
    preferNostr?: boolean
    enableGrasp?: boolean
  } = {},
): "nostr" | "traditional" {
  const {preferNostr = false, enableGrasp = true} = options

  if (/^nostr:(?:\/\/)?/i.test(url)) {
    assertDirectNostrGitProviderEnabled("URL selection")
    return "nostr"
  }

  if (enableGrasp && isGraspRepoHttpUrl(url)) {
    return ENABLE_DIRECT_NOSTR_GIT_PROVIDER ? "nostr" : "traditional"
  }

  if (preferNostr) {
    assertDirectNostrGitProviderEnabled("preferred provider selection")
    return "nostr"
  }

  return "traditional"
}