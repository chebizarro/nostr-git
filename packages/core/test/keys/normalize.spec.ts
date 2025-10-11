/**
 * Tests for repository key normalization.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeRepoKey, normalizeRepoKeySync, type NormalizedRepoKey } from '../../src/keys/normalize.js';
import { nip19, nip05 } from 'nostr-tools';

describe('normalizeRepoKey', () => {
  describe('naddr input', () => {
    it('should accept and return valid naddr', async () => {
      const pubkey = '0'.repeat(64);
      const naddr = nip19.naddrEncode({
        kind: 30617,
        pubkey,
        identifier: 'test-repo',
        relays: [],
      });

      const result = await normalizeRepoKey(naddr);

      expect(result.input).toBe(naddr);
      expect(result.naddr).toBe(naddr);
      expect(result.parts.pubkey).toBe(pubkey);
      expect(result.parts.name).toBe('test-repo');
      expect(result.parts.npub).toBe(nip19.npubEncode(pubkey));
    });

    it('should reject naddr with wrong kind', async () => {
      const pubkey = '0'.repeat(64);
      const naddr = nip19.naddrEncode({
        kind: 1, // Wrong kind
        pubkey,
        identifier: 'test',
        relays: [],
      });

      await expect(normalizeRepoKey(naddr)).rejects.toThrow('Invalid kind 1, expected 30617');
    });

    it('should handle naddr without identifier', async () => {
      const pubkey = '0'.repeat(64);
      const naddr = nip19.naddrEncode({
        kind: 30617,
        pubkey,
        identifier: '',
        relays: [],
      });

      const result = await normalizeRepoKey(naddr);

      expect(result.naddr).toBe(naddr);
      expect(result.parts.name).toBeUndefined();
    });
  });

  describe('npub/name input', () => {
    it('should normalize npub/name to naddr', async () => {
      const pubkey = '1'.repeat(64);
      const npub = nip19.npubEncode(pubkey);
      const input = `${npub}/my-repo`;

      const result = await normalizeRepoKey(input);

      expect(result.input).toBe(input);
      expect(result.parts.pubkey).toBe(pubkey);
      expect(result.parts.npub).toBe(npub);
      expect(result.parts.name).toBe('my-repo');
      
      // Verify naddr can be decoded
      const decoded = nip19.decode(result.naddr);
      expect(decoded.type).toBe('naddr');
      expect((decoded.data as any).pubkey).toBe(pubkey);
      expect((decoded.data as any).identifier).toBe('my-repo');
    });

    it('should reject invalid npub', async () => {
      await expect(normalizeRepoKey('npub1invalid/repo')).rejects.toThrow();
    });

    it('should reject npub/name without name part', async () => {
      const npub = nip19.npubEncode('2'.repeat(64));
      await expect(normalizeRepoKey(`${npub}/`)).rejects.toThrow('must have both identifier and name');
    });
  });

  describe('pubkey/name input', () => {
    it('should normalize hex pubkey/name to naddr', async () => {
      const pubkey = '3'.repeat(64);
      const input = `${pubkey}/test-repo`;

      const result = await normalizeRepoKey(input);

      expect(result.input).toBe(input);
      expect(result.parts.pubkey).toBe(pubkey);
      expect(result.parts.name).toBe('test-repo');
      expect(result.parts.npub).toBe(nip19.npubEncode(pubkey));
    });

    it('should reject invalid hex pubkey', async () => {
      await expect(normalizeRepoKey('invalid-hex/repo')).rejects.toThrow('Invalid pubkey format');
    });

    it('should reject pubkey with wrong length', async () => {
      await expect(normalizeRepoKey('abc123/repo')).rejects.toThrow('must be 64 hex characters');
    });
  });

  describe('nip-05/name input', () => {
    beforeEach(() => {
      // Mock nip05.queryProfile
      vi.spyOn(nip05, 'queryProfile').mockResolvedValue({
        pubkey: '4'.repeat(64),
        relays: [],
      } as any);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should resolve nip-05/name to naddr', async () => {
      const input = 'user@example.com/my-repo';

      const result = await normalizeRepoKey(input);

      expect(result.input).toBe(input);
      expect(result.parts.pubkey).toBe('4'.repeat(64));
      expect(result.parts.name).toBe('my-repo');
      expect(result.parts.nip05).toBe('user@example.com');
      expect(nip05.queryProfile).toHaveBeenCalledWith('user@example.com');
    });

    it('should reject unresolvable nip-05', async () => {
      vi.spyOn(nip05, 'queryProfile').mockResolvedValue(null as any);

      await expect(normalizeRepoKey('invalid@example.com/repo')).rejects.toThrow('Failed to resolve NIP-05');
    });
  });

  describe('bare npub input', () => {
    it('should normalize bare npub to naddr without identifier', async () => {
      const pubkey = '5'.repeat(64);
      const npub = nip19.npubEncode(pubkey);

      const result = await normalizeRepoKey(npub);

      expect(result.input).toBe(npub);
      expect(result.parts.pubkey).toBe(pubkey);
      expect(result.parts.npub).toBe(npub);
      expect(result.parts.name).toBeUndefined();
      
      const decoded = nip19.decode(result.naddr);
      expect((decoded.data as any).identifier).toBe('');
    });
  });

  describe('bare hex pubkey input', () => {
    it('should normalize bare hex pubkey to naddr without identifier', async () => {
      const pubkey = '6'.repeat(64);

      const result = await normalizeRepoKey(pubkey);

      expect(result.input).toBe(pubkey);
      expect(result.parts.pubkey).toBe(pubkey);
      expect(result.parts.name).toBeUndefined();
    });
  });

  describe('bare nip-05 input', () => {
    beforeEach(() => {
      vi.spyOn(nip05, 'queryProfile').mockResolvedValue({
        pubkey: '7'.repeat(64),
        relays: [],
      } as any);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should resolve bare nip-05 to naddr without identifier', async () => {
      const input = 'user@example.com';

      const result = await normalizeRepoKey(input);

      expect(result.input).toBe(input);
      expect(result.parts.pubkey).toBe('7'.repeat(64));
      expect(result.parts.nip05).toBe(input);
      expect(result.parts.name).toBeUndefined();
    });
  });

  describe('error cases', () => {
    it('should reject empty string', async () => {
      await expect(normalizeRepoKey('')).rejects.toThrow('empty string');
    });

    it('should reject whitespace-only string', async () => {
      await expect(normalizeRepoKey('   ')).rejects.toThrow('empty string');
    });

    it('should reject null', async () => {
      await expect(normalizeRepoKey(null as any)).rejects.toThrow('must be a non-empty string');
    });

    it('should reject undefined', async () => {
      await expect(normalizeRepoKey(undefined as any)).rejects.toThrow('must be a non-empty string');
    });

    it('should reject unrecognized format', async () => {
      await expect(normalizeRepoKey('random-string')).rejects.toThrow('Unrecognized repository key format');
    });
  });
});

describe('normalizeRepoKeySync', () => {
  it('should normalize naddr synchronously', () => {
    const pubkey = '8'.repeat(64);
    const naddr = nip19.naddrEncode({
      kind: 30617,
      pubkey,
      identifier: 'test',
      relays: [],
    });

    const result = normalizeRepoKeySync(naddr);

    expect(result.naddr).toBe(naddr);
    expect(result.parts.pubkey).toBe(pubkey);
  });

  it('should normalize npub/name synchronously', () => {
    const pubkey = '9'.repeat(64);
    const npub = nip19.npubEncode(pubkey);
    const input = `${npub}/repo`;

    const result = normalizeRepoKeySync(input);

    expect(result.parts.pubkey).toBe(pubkey);
    expect(result.parts.name).toBe('repo');
  });

  it('should normalize pubkey/name synchronously', () => {
    const pubkey = 'a'.repeat(64);
    const input = `${pubkey}/repo`;

    const result = normalizeRepoKeySync(input);

    expect(result.parts.pubkey).toBe(pubkey);
    expect(result.parts.name).toBe('repo');
  });

  it('should reject nip-05 (requires async)', () => {
    expect(() => normalizeRepoKeySync('user@example.com/repo')).toThrow('Cannot synchronously normalize NIP-05');
  });

  it('should reject bare nip-05', () => {
    expect(() => normalizeRepoKeySync('user@example.com')).toThrow('Cannot synchronously normalize NIP-05');
  });
});
