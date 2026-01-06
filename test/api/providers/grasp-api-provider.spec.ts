import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraspApiProvider } from '../../../src/api/providers/grasp.js';
import * as git from 'isomorphic-git';

// Helper to set private fields via casting
function setPriv<T extends object>(obj: T, key: string, value: any) {
  (obj as any)[key] = value;
}

describe('GraspApiProvider basic behavior', () => {
  const relay = 'wss://relay.example';
  const ownerHex = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getRepo builds metadata from relay/httpBase and event state', async () => {
    const api = new GraspApiProvider(relay, ownerHex as any);
    // Pretend capabilities are loaded with a specific httpBase
    setPriv(api, 'capabilities', { grasp01: true, grasp05: false, httpOrigins: ['https://relay.example'], nostrRelays: [relay] });
    setPriv(api, 'httpBase', 'https://relay.example');

    // Mock announcement and state returns via queryEvents
    const ann = { content: JSON.stringify({ description: 'test repo' }), tags: [] };
    const st = { tags: [['HEAD', 'ref: refs/heads/main']] };
    (vi.spyOn(api as any, 'queryEvents') as any).mockImplementation(async (filters: any[]) => {
      const kinds = filters?.[0]?.kinds || [];
      if (kinds.includes(30617)) return [ann as any]; // announcement
      if (kinds.includes(30618)) return [st as any];  // state
      return [];
    });

    const out = await api.getRepo(ownerHex, 'myrepo');
    // Basic shape checks without relying on nip19 specifics
    expect(out.cloneUrl.endsWith('/myrepo.git')).toBe(true);
    expect(out.cloneUrl.startsWith('https://relay.example/')).toBe(true);
    expect(out.htmlUrl.endsWith('/myrepo')).toBe(true);
    expect(out.defaultBranch).toBe('main');
    expect(out.description).toBe('test repo');
  });

  it('listIssues is not supported and throws', async () => {
    const api = new GraspApiProvider(relay, ownerHex as any);
    await expect(api.listIssues(ownerHex, 'x')).rejects.toThrow(/not supported/);
  });

  it('getCommit propagates error with stable message', async () => {
    const api = new GraspApiProvider(relay, ownerHex as any);
    // Seed capabilities/httpBase to avoid ensureCapabilities network work
    setPriv(api, 'capabilities', { grasp01: true, grasp05: false, httpOrigins: ['https://relay.example'], nostrRelays: [relay] });
    setPriv(api, 'httpBase', 'https://relay.example');
    // Avoid fetch dependency; mock readCommit to reject
    const spy = vi.spyOn(git as any, 'readCommit').mockRejectedValue(new Error('nope'));
    await expect(api.getCommit(ownerHex, 'repo', 'abcd')).rejects.toThrow(/Failed to get commit:/);
    spy.mockRestore();
  });
});
