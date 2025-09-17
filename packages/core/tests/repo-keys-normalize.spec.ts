import { describe, it, expect } from 'vitest';
import {
  normalizeRepoKeyFlexible,
  type RepoKeyPreference,
  type RepoKeyResolvers
} from '../src/lib/repoKeys.js';

const io: RepoKeyResolvers = {
  verifyNip05: async (nip05) => nip05 === 'alice.example.com',
  nip05ToPubkey: async (nip05) => (nip05 === 'alice.example.com' ? 'npub1alice' : null),
  pubkeyToNip05: async (pubkey) => (pubkey === 'npub1alice' ? 'alice.example.com' : null),
  encodeNaddr: (pubkey, identifier) => `naddr1:${pubkey}:${identifier}`,
  decodeNaddr: (n) => {
    const parts = n.split(':');
    if (parts[0] !== 'naddr1') return null;
    return { pubkey: parts[1], identifier: parts[2] };
  }
};

describe('normalizeRepoKeyFlexible', () => {
  it('keeps/produces npub form', async () => {
    await expect(normalizeRepoKeyFlexible('npub1alice/amethyst', 'npub', io)).resolves.toBe(
      'npub1alice/amethyst'
    );
    await expect(normalizeRepoKeyFlexible('alice.example.com/amethyst', 'npub', io)).resolves.toBe(
      'npub1alice/amethyst'
    );
  });

  it('keeps/produces nip05 form if verified', async () => {
    await expect(normalizeRepoKeyFlexible('alice.example.com/amethyst', 'nip05', io)).resolves.toBe(
      'alice.example.com/amethyst'
    );
    await expect(normalizeRepoKeyFlexible('npub1alice/amethyst', 'nip05', io)).resolves.toBe(
      'alice.example.com/amethyst'
    );
  });

  it('produces naddr form from other inputs', async () => {
    await expect(normalizeRepoKeyFlexible('npub1alice/amethyst', 'naddr', io)).resolves.toBe(
      'naddr1:npub1alice:amethyst'
    );
    await expect(normalizeRepoKeyFlexible('alice.example.com/amethyst', 'naddr', io)).resolves.toBe(
      'naddr1:npub1alice:amethyst'
    );
  });

  it('parses and re-encodes naddr as requested', async () => {
    await expect(normalizeRepoKeyFlexible('naddr1:npub1alice:amethyst', 'npub', io)).resolves.toBe(
      'npub1alice/amethyst'
    );
    await expect(normalizeRepoKeyFlexible('naddr1:npub1alice:amethyst', 'nip05', io)).resolves.toBe(
      'alice.example.com/amethyst'
    );
    await expect(normalizeRepoKeyFlexible('naddr1:npub1alice:amethyst', 'naddr', io)).resolves.toBe(
      'naddr1:npub1alice:amethyst'
    );
  });
});
