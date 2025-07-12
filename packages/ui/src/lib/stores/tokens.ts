import { writable } from "svelte/store";

export interface Token {
  host: string;
  token: string;
}

function createTokenStore() {
  const { subscribe, update, set } = writable<Token[]>([]);

  function push(token: Token) {
    update((tokens) => [...tokens, token]);
  }

  function clear() {
    set([]);
  }

  return {
    subscribe,
    push,
    clear,
  };
}

export const tokens = createTokenStore();