import {describe, it, expect, vi, beforeEach} from "vitest"

// Import compiled JS to avoid TS path issues in test env
import "../vitest-setup"
import {showSnackbar} from "../../src/utils"

function getContainer() {
  return document.querySelector("#nostr-snackbar-container") as HTMLElement | null
}

describe("showSnackbar", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
  })

  it("renders a snackbar with proper a11y attributes", () => {
    showSnackbar("Hello")
    const container = getContainer()
    expect(container).toBeTruthy()
    expect(container?.getAttribute("role")).toBe("status")
    expect(container?.getAttribute("aria-live")).toBe("polite")
    const child = container!.lastElementChild as HTMLElement | null
    expect(child?.textContent).toContain("Hello")
  })

  it("respects prefers-reduced-motion by disabling transitions", () => {
    // Mock matchMedia
    const mql = {
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList
    vi.spyOn(window, "matchMedia").mockReturnValue(mql)

    showSnackbar("Reduced")
    const container = getContainer()
    const el = container!.lastElementChild as HTMLElement | null
    expect(el).toBeTruthy()
    // Inline style should be set to 'none' when reduced motion is on
    expect(el!.style.transition).toBe("none")
  })
})
