// Compile-time flag injected by esbuild define
declare const __SHOW_DEBUG__: boolean

import {
  DEFAULT_RELAYS,
  getDebugFlag,
  setDebugFlag,
  getViewerBase,
  setViewerBase,
  DEFAULT_VIEWER_BASE,
} from "./defaults"
import {normalizeRelays, normalizeViewerBase} from "./popup-logic"

const relayForm = document.getElementById("relayForm") as HTMLFormElement | null
const relayList = document.getElementById("relayList") as HTMLTextAreaElement | null
const statusElement = document.getElementById("status") as HTMLParagraphElement | null
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement | null
const debugToggle = document.getElementById("debugToggle") as HTMLInputElement | null
const viewerBaseInput = document.getElementById("viewerBase") as HTMLInputElement | null
const saveViewerBaseBtn = document.getElementById("saveViewerBaseBtn") as HTMLButtonElement | null
const resetViewerBaseBtn = document.getElementById("resetViewerBaseBtn") as HTMLButtonElement | null

function setStatus(msg: string) {
  if (statusElement) {
    statusElement.textContent = msg
  }
}

// Load existing relays or fallback
chrome.storage.sync.get(["nostrRelays"], ({nostrRelays}) => {
  if (!relayList) return
  const relays = Array.isArray(nostrRelays) ? nostrRelays : DEFAULT_RELAYS
  relayList.value = relays.join("\n")
})

// Determine compile-time debug visibility
const SHOW_DEBUG: boolean = typeof __SHOW_DEBUG__ !== "undefined" ? __SHOW_DEBUG__ : true
// Set attribute ASAP to avoid flicker (no inline scripts allowed by CSP)
try {
  if (!SHOW_DEBUG) document.documentElement.setAttribute("hide-debug", "true")
} catch {}

// Load debug flag (compile-time hide if disabled)
if (SHOW_DEBUG) {
  getDebugFlag().then(on => {
    if (debugToggle) debugToggle.checked = !!on
  })
} else {
  // Hide debug controls entirely
  const row = debugToggle?.closest(".row") || debugToggle?.parentElement
  if (row) (row as HTMLElement).style.display = "none"
  const help = document.getElementById("debugHelp")
  if (help) (help as HTMLElement).style.display = "none"
}

// Load Viewer Base URL
getViewerBase().then(base => {
  if (viewerBaseInput) viewerBaseInput.value = base || DEFAULT_VIEWER_BASE
})

// Save relays via form submit
relayForm?.addEventListener("submit", e => {
  e.preventDefault()
  if (!relayList) return
  const lines = relayList.value.split("\n")
  const {relays, invalid} = normalizeRelays(lines)
  if (invalid.length) {
    relayList.setAttribute("aria-invalid", "true")
    setStatus(`Ignored invalid entries: ${invalid.join(", ")}`)
  } else {
    relayList.removeAttribute("aria-invalid")
    setStatus("")
  }
  chrome.storage.sync.set({nostrRelays: relays}, () => {
    setStatus("Relays saved!")
    setTimeout(() => setStatus(""), 2000)
  })
})

// Reset to defaults
resetBtn?.addEventListener("click", () => {
  if (!relayList) return
  relayList.value = DEFAULT_RELAYS.join("\n")
  chrome.storage.sync.set({nostrRelays: DEFAULT_RELAYS}, () => {
    setStatus("Restored default relays.")
    setTimeout(() => setStatus(""), 2000)
  })
})

// Toggle debug
if (SHOW_DEBUG) {
  debugToggle?.addEventListener("change", async e => {
    const on = (e.target as HTMLInputElement).checked
    await setDebugFlag(on)
    setStatus(on ? "Debug: console-only enabled" : "Debug disabled")
    setTimeout(() => setStatus(""), 1500)
  })
}

// Save Viewer Base URL
saveViewerBaseBtn?.addEventListener("click", async () => {
  if (!viewerBaseInput) return
  const raw = viewerBaseInput.value.trim()
  try {
    const url = normalizeViewerBase(raw || DEFAULT_VIEWER_BASE)
    await setViewerBase(url)
    viewerBaseInput.value = url
    viewerBaseInput.removeAttribute("aria-invalid")
    setStatus("Viewer base URL saved.")
  } catch {
    viewerBaseInput.setAttribute("aria-invalid", "true")
    setStatus("Invalid URL. Example: https://njump.me/")
  }
  setTimeout(() => setStatus(""), 2000)
})

// Reset Viewer Base URL to default
resetViewerBaseBtn?.addEventListener("click", async () => {
  if (!viewerBaseInput) return
  const url = DEFAULT_VIEWER_BASE
  await setViewerBase(url)
  viewerBaseInput.value = url
  viewerBaseInput.removeAttribute("aria-invalid")
  setStatus("Viewer base reset to default.")
  setTimeout(() => setStatus(""), 2000)
})

// Signal test readiness
;(window as any).__POPUP_READY__ = true
