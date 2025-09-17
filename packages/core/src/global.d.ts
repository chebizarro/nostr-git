declare global {
  interface Window {
    Buffer: typeof Buffer;
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: {
        created_at: number;
        kind: number;
        tags: string[][];
        content: string;
      }) => Promise<{
        id: string;
        pubkey: string;
        created_at: number;
        kind: number;
        tags: string[][];
        content: string;
        sig: string;
      }>;
      nip04?: {
        encrypt: (pubkey: string, plaintext: string) => Promise<string>;
        decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
      };
      nip44?: {
        encrypt: (pubkey: string, plaintext: string) => Promise<string>;
        decrypt: (pubkey: string, ciphertext: string) => Promise<string>;
      };
    };
  }
}

declare module '*.svelte' {
  import { SvelteComponentTyped } from 'svelte';
  export default class Component extends SvelteComponentTyped<any> {}
}

export {};
