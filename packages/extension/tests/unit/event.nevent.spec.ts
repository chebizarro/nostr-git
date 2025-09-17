import {describe, it, expect, vi, beforeEach, afterEach} from "vitest"
import {copyNeventToClipboard} from "../../src/event"

// Minimal fake event to satisfy types
const fakeEvent = {
  id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  pubkey: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  kind: 1,
  content: "",
  created_at: Math.floor(Date.now() / 1000),
  sig: "sig",
  tags: [],
} as any

describe("copyNeventToClipboard", () => {
  let writeTextMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    writeTextMock = vi.fn()
    // Define a configurable clipboard property even if it's read-only by default
    Object.defineProperty(globalThis.navigator as any, "clipboard", {
      configurable: true,
      get() {
        return {writeText: writeTextMock}
      },
    })
  })

  afterEach(() => {
    // Remove our getter to avoid leaking between tests
    try {
      delete (globalThis.navigator as any).clipboard
    } catch {}
  })

  it("returns nevent even if clipboard write fails", async () => {
    writeTextMock.mockRejectedValueOnce(new Error("no access"))
    const nevent = await copyNeventToClipboard(fakeEvent, ["wss://example"])
    expect(typeof nevent).toBe("string")
    expect(nevent).toMatch(/^nevent1/)
  })

  it("returns nevent when clipboard write succeeds", async () => {
    writeTextMock.mockResolvedValueOnce(undefined)
    const nevent = await copyNeventToClipboard(fakeEvent, ["wss://example"])
    expect(typeof nevent).toBe("string")
    expect(nevent).toMatch(/^nevent1/)
  })
})
