// Minimal Nostr client abstraction for publishing/subscribing to events

export interface NostrEvent {
  kind: number
  pubkey: string
  created_at: number
  tags: string[][]
  content: string
  id?: string
  sig?: string
}

export interface NostrClient {
  publish(event: NostrEvent): Promise<string> // returns event id
  subscribe(filters: any, onEvent: (event: NostrEvent) => void): string // returns subscription id
  unsubscribe(subId: string): void
}
