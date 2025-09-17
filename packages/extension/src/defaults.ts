export const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://bitcoiner.social"]

export const DEFAULT_VIEWER_BASE = "https://njump.me/"

export function getActiveRelays(): Promise<string[]> {
  return new Promise(resolve => {
    chrome.storage.sync.get(["nostrRelays"], ({nostrRelays}) => {
      resolve(Array.isArray(nostrRelays) ? nostrRelays : DEFAULT_RELAYS)
    })
  })
}

export function getDebugFlag(): Promise<boolean> {
  return new Promise(resolve => {
    chrome.storage.sync.get(["nostrDebug"], ({nostrDebug}) => {
      resolve(Boolean(nostrDebug))
    })
  })
}

export function setDebugFlag(value: boolean): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.sync.set({nostrDebug: value}, () => resolve())
  })
}

export function getViewerBase(): Promise<string> {
  return new Promise(resolve => {
    chrome.storage.sync.get(["nostrViewerBase"], ({nostrViewerBase}) => {
      const base =
        typeof nostrViewerBase === "string" && nostrViewerBase.trim()
          ? nostrViewerBase.trim()
          : DEFAULT_VIEWER_BASE
      resolve(base)
    })
  })
}

export function setViewerBase(value: string): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.sync.set({nostrViewerBase: value}, () => resolve())
  })
}
