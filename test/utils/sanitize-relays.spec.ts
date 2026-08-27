import {describe, it, expect} from "vitest"
import {normalizeRelayUrl, sanitizeRelays} from "../../src/utils/sanitize-relays.js"

describe("utils/sanitize-relays", () => {
  it.each([
    ["wss://Relay.Example", "wss://relay.example/"],
    ["WSS://Relay.Example", "wss://relay.example/"],
    ["Relay.Example", "wss://relay.example/"],
    [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion",
      "ws://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion/",
    ],
    [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion/GRASP",
      "ws://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion/GRASP",
    ],
    [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion?tenant=One",
      "ws://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onion/?tenant=One",
    ],
    ["localhost:7777", "wss://localhost:7777/"],
    ["wss://relay.example:443", "wss://relay.example/"],
    ["ws://relay.example:80", "ws://relay.example/"],
    ["wss://relay.example:444", "wss://relay.example:444/"],
    ["wss://relay.example/GRASP", "wss://relay.example/GRASP"],
    ["wss://relay.example/path/", "wss://relay.example/path/"],
    ["wss://relay.example/a//b", "wss://relay.example/a//b"],
    ["wss://relay.example?token=AbC%2F123", "wss://relay.example/?token=AbC%2F123"],
    ["wss://relay.example/?b=Two&a=One", "wss://relay.example/?b=Two&a=One"],
    ["wss://relay.example/Path#section", "wss://relay.example/Path"],
  ])("canonicalizes %s as %s", (input, expected) => {
    expect(normalizeRelayUrl(input)).toBe(expected)
  })

  it("rejects credentials while preserving case-sensitive query values", () => {
    const list = sanitizeRelays([
      "WSS://user:pass@Relay.Example.Com:443/ws?x=1",
      "wss://relay.example.com/ws?x=1",
      "not-a-url",
      "http://relay.example.com",
      "wss://invalid-no-dot",
    ])

    expect(list).not.toContainEqual(expect.stringContaining("user"))
    expect(list).toContain("wss://relay.example.com/ws?x=1")
    // Should not include obviously invalid or disallowed hosts (no dot in hostname)
    expect(list.some(u => u.includes("invalid-no-dot"))).toBe(false)
    // All entries should be unique
    expect(new Set(list).size).toBe(list.length)
  })

  it("filters invalid and duplicates, supports onion addresses", () => {
    const out = sanitizeRelays([
      "wss://relay.example.com/",
      "wss://relay.example.com",
      "exampleonionaddress.onion",
      "wss://invalid host",
    ])
    expect(out).toContain("wss://relay.example.com/")
    expect(out.find(u => u.includes("onion"))?.startsWith("ws://")).toBe(true)
    // deduped
    expect(out.filter(u => u === "wss://relay.example.com/").length).toBe(1)
  })

  it("drops platform and clone URLs instead of coercing them into relays", () => {
    expect(
      sanitizeRelays([
        "https://github.com",
        "https://github.com/Pleb5/flotilla-budabit",
        "https://github.com/Pleb5/flotilla-budabit.git",
        "github.com/Pleb5/flotilla-budabit.git",
        "wss://github.com/Pleb5/flotilla-budabit.git",
        "https://relay.example.com",
      ]),
    ).toEqual([])
  })

  it.each([
    "",
    "not-a-host",
    "https://relay.example",
    "wss://",
    "wss://user:pass@relay.example/path",
  ])("rejects unsupported direct normalization input %j", input => {
    expect(() => normalizeRelayUrl(input)).toThrow()
  })
})
