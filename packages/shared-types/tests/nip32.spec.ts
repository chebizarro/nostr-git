import {describe, it, expect} from "vitest"
import type {Event} from "nostr-tools"
import {extractSelfLabels, extractLabelEvents, mergeEffectiveLabels} from "../src/nip32"

function evt(tags: string[][]): Event {
  return {
    id: "x",
    kind: 1,
    pubkey: "p",
    created_at: 0,
    content: "",
    tags,
    sig: "s",
  } as unknown as Event
}

describe("NIP-32 label helpers", () => {
  it("extracts self labels with namespaces from L/l tags", () => {
    const e = evt([
      ["L", "status"],
      ["l", "open", "status"],
      ["l", "bug"], // no namespace
      ["t", "triage"],
    ])
    const self = extractSelfLabels(e)
    expect(self).toEqual([
      {namespace: "status", value: "open", mark: "status"},
      {namespace: undefined, value: "bug", mark: undefined},
    ])
  })

  it("extracts external labels from 1985 label events", () => {
    const exts = [
      evt([
        ["L", "type"],
        ["l", "bug", "type"],
      ]),
      evt([
        ["L", "status"],
        ["l", "open", "status"],
      ]),
    ]
    const labels = extractLabelEvents(exts as any)
    expect(labels.find(l => l.value === "bug")?.namespace).toBe("type")
    expect(labels.find(l => l.value === "open")?.namespace).toBe("status")
  })

  it("merges with precedence: self, then external, then t-tags (normalized only)", () => {
    const self = [{namespace: "status", value: "open"}]
    const external = [{namespace: "type", value: "bug"}]
    const t = ["good-first-issue"]
    const merged = mergeEffectiveLabels({self, external, t})
    expect(merged.normalized).toEqual(["status/open", "type/bug", "t/good-first-issue"])
  })
})
