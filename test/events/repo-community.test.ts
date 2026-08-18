import {describe, expect, it} from "vitest"
import {
  createRepoAnnouncementEvent,
  parseRepoAnnouncementEvent,
  parseRepoCommunityBinding,
  withRepoCommunityBinding,
} from "../../src/events/index.js"

const author = "a".repeat(64)
const community = "b".repeat(64)
const communityAddress = `32222:${author}:${community}`

describe("repo community binding", () => {
  it("writes and parses direct repo community metadata", () => {
    const event = createRepoAnnouncementEvent({
      repoId: "demo",
      name: "Demo",
      community: {
        address: communityAddress,
        communityId: community,
        relay: "wss://relay.example.com/",
      },
    }) as any
    event.id = "event-id"
    event.pubkey = author

    expect(event.tags).toContainEqual(["h", community, "wss://relay.example.com"])
    expect(event.tags).toContainEqual(["a", communityAddress, "wss://relay.example.com"])
    expect(parseRepoAnnouncementEvent(event).community).toEqual({
      address: communityAddress,
      communityId: community,
      relay: "wss://relay.example.com",
    })
  })

  it("ignores non-pubkey h values", () => {
    expect(
      parseRepoCommunityBinding([
        ["h", "targeting-id-not-a-pubkey"],
        ["a", communityAddress],
        ["name", "Demo"],
      ]),
    ).toBeUndefined()
  })

  it("replaces existing h tags with repo community metadata", () => {
    const updated = withRepoCommunityBinding(
      {
        tags: [
          ["d", "demo"],
          ["h", "targeting-id-not-a-pubkey"],
          ["h", community],
        ],
      },
      {address: `32222:${community}:${author}`, communityId: author},
    )

    expect(updated.tags).toEqual([
      ["d", "demo"],
      ["h", author],
      ["a", `32222:${community}:${author}`],
    ])
  })

  it("removes community binding on demand", () => {
    const updated = withRepoCommunityBinding({
      tags: [["d", "demo"], ["h", community], ["a", communityAddress]],
    })

    expect(updated.tags).toEqual([["d", "demo"]])
  })
})
