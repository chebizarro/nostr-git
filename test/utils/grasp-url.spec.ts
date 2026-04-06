import {describe, expect, it} from "vitest"

import {resolveCorsProxyForUrl} from "../../src/utils/grasp-url.js"

describe("grasp-url utilities", () => {
  it("forces direct transport for grasp-like HTTP remotes", () => {
    const url =
      "https://relay.ngit.dev/npub16p8v7varqwjes5hak6q7mz6pygqm4pwc6gve4mrned3xs8tz42gq7kfhdw/flotilla-budabit.git"

    expect(resolveCorsProxyForUrl(url, "https://cors.isomorphic-git.org")).toBeNull()
  })

  it("preserves the fallback proxy for non-grasp remotes", () => {
    expect(
      resolveCorsProxyForUrl(
        "https://github.com/Pleb5/flotilla-budabit.git",
        "https://cors.isomorphic-git.org",
      ),
    ).toBe("https://cors.isomorphic-git.org")
  })

  it("preserves undefined fallback for non-grasp remotes", () => {
    expect(resolveCorsProxyForUrl("https://github.com/Pleb5/flotilla-budabit.git")).toBeUndefined()
  })
})
