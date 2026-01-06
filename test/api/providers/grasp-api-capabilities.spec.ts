import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GraspApi } from '../../../src/api/providers/grasp-api.js';
import { nip11 } from 'nostr-tools';

vi.mock('nostr-tools', async (orig) => {
  const actual = await (orig() as any);
  return {
    ...actual,
    nip11: {
      fetchRelayInformation: vi.fn()
    }
  };
});

describe('GraspApi relay capabilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('checkRelayCapabilities returns true when supported_nips includes 30618', async () => {
    (nip11.fetchRelayInformation as any).mockResolvedValueOnce({ supported_nips: [1, 2, 30618] });
    const api = new GraspApi({ relays: ['wss://relay.one'], publishEvent: async () => ({ ok: true }) as any });
    await expect(api.checkRelayCapabilities('wss://relay.one')).resolves.toBe(true);
  });

  it('checkRelayCapabilities handles errors and returns false', async () => {
    (nip11.fetchRelayInformation as any).mockRejectedValueOnce(new Error('boom'));
    const api = new GraspApi({ relays: ['wss://relay.one'], publishEvent: async () => ({ ok: true }) as any });
    await expect(api.checkRelayCapabilities('wss://relay.one')).resolves.toBe(false);
  });

  it('getCapableRelays filters by capability', async () => {
    const api = new GraspApi({ relays: ['wss://a', 'wss://b', 'wss://c'], publishEvent: async () => ({ ok: true }) as any });
    // Spy on instance method to isolate behavior
    const spy = vi.spyOn(api, 'checkRelayCapabilities');
    spy.mockResolvedValueOnce(true);
    spy.mockResolvedValueOnce(false);
    spy.mockResolvedValueOnce(true);
    const capable = await api.getCapableRelays();
    expect(capable).toEqual(['wss://a', 'wss://c']);
  });
});
