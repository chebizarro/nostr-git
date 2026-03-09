import {describe, it, expect} from "vitest"
import "fake-indexeddb/auto"
import {nip19} from "nostr-tools"
import {getVendorProvider, clearProviderRegistry} from "../../src/git/vendor-provider-factory.js"

describe("vendor-provider-factory grasp owner normalization", () => {
  it("getCloneUrl normalizes grasp owner to npub when owner is hex", () => {
    clearProviderRegistry()
    const p = getVendorProvider("grasp", "relay.example") as any
    const ownerHex = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    const ownerNpub = nip19.npubEncode(ownerHex)
    expect(p.getCloneUrl(ownerHex, "repo")).toBe(`wss://relay.example/${ownerNpub}/repo.git`)
  })
})
