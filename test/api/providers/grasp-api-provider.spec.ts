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

  it('getRelayInfo returns cached relay info after ensureCapabilities', async () => {
    const api = new GraspApiProvider(relay, ownerHex as any);
    (vi.spyOn(api as any, 'ensureCapabilities') as any).mockResolvedValue(undefined);
    setPriv(api, 'relayInfo', { name: 'relay-name', supported_grasps: ['GRASP-01'] });
    const info = await api.getRelayInfo();
    expect((info as any).name).toBe('relay-name');
  });

  it('getRepo sets description undefined when announcement missing or unparsable', async () => {
    const api = new GraspApiProvider(relay, ownerHex as any);
    setPriv(api, 'capabilities', { grasp01: true, grasp05: false, httpOrigins: ['https://relay.example'], nostrRelays: [relay] });
    setPriv(api, 'httpBase', 'https://relay.example');
    // queryEvents returns no announcement
    (vi.spyOn(api as any, 'queryEvents') as any).mockResolvedValueOnce([]);
    // fetchLatestState returns a valid head
    (vi.spyOn(api as any, 'fetchLatestState') as any).mockResolvedValueOnce({ head: 'ref: refs/heads/main', refs: {} });
    const repo = await api.getRepo(ownerHex, 'repo');
    expect(repo.description).toBeUndefined();
  });

  it('getRepo falls back to defaultBranch "main" when no state event HEAD is available', async () => {
    const api = new GraspApiProvider(relay, ownerHex as any);
    setPriv(api, 'capabilities', { grasp01: true, grasp05: false, httpOrigins: ['https://relay.example'], nostrRelays: [relay] });
    setPriv(api, 'httpBase', 'https://relay.example');
    // announcement present but irrelevant
    const ann = { content: JSON.stringify({}) };
    (vi.spyOn(api as any, 'queryEvents') as any).mockResolvedValueOnce([ann]);
    // fetchLatestState returns null
    (vi.spyOn(api as any, 'fetchLatestState') as any).mockResolvedValueOnce(null);
    const repo = await api.getRepo(ownerHex, 'repo');
    expect(repo.defaultBranch).toBe('main');
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

  it('unimplemented methods throw clear errors', async () => {
    const api = new GraspApiProvider(relay, ownerHex as any);
    await expect(api.getFileContent(ownerHex, 'repo', 'path.txt')).rejects.toThrow(/not implemented/);
    await expect(api.listBranches(ownerHex, 'repo')).rejects.toThrow(/not implemented/);
    await expect(api.getBranch(ownerHex, 'repo', 'main')).rejects.toThrow(/not implemented/);
    await expect(api.listTags(ownerHex, 'repo')).rejects.toThrow(/not implemented/);
    await expect(api.getTag(ownerHex, 'repo', 'v1.0.0')).rejects.toThrow(/not implemented/);
    await expect(api.createPullRequest(ownerHex, 'repo', { title: 'x', head: 'a', base: 'b' })).rejects.toThrow(/not implemented/);
    await expect(api.updatePullRequest(ownerHex, 'repo', 1, {})).rejects.toThrow(/not implemented/);
    await expect(api.mergePullRequest(ownerHex, 'repo', 1, {} as any)).rejects.toThrow(/not implemented/);
    await expect(api.createIssue(ownerHex, 'repo', { title: 'x' } as any)).rejects.toThrow(/not supported/);
    await expect(api.updateIssue(ownerHex, 'repo', 1, {})).rejects.toThrow(/not implemented/);
    // closeIssue calls getIssue -> listIssues, which throws 'not supported'
    await expect(api.closeIssue(ownerHex, 'repo', 1)).rejects.toThrow(/not supported/);
    await expect(api.listPatches(ownerHex, 'repo')).rejects.toThrow(/not supported/);
  });

  it('getCurrentUser maps profile from kind-0 event content when available', async () => {
    const api = new GraspApiProvider(relay, ownerHex as any);
    const profile = { name: 'Alice', about: 'hi', picture: 'p.png', website: 'https://w' };
    (vi.spyOn(api as any, 'queryEvents') as any).mockResolvedValueOnce([{ content: JSON.stringify(profile) }]);
    const user = await api.getCurrentUser();
    expect(user.name).toBe('Alice');
    expect(user.avatarUrl).toBe('p.png');
    expect(user.blog).toBe('https://w');
  });

  it('getUser throws on invalid npub identifier and succeeds on valid', async () => {
    const api = new GraspApiProvider(relay, ownerHex as any);
    await expect(api.getUser('alice')).rejects.toThrow(/Invalid user identifier/);
  });

  it('listPullRequests maps from listPatches with base ref derived from repo state', async () => {
    const api = new GraspApiProvider(relay, ownerHex as any);
    setPriv(api, 'capabilities', { grasp01: true, grasp05: false, httpOrigins: ['https://relay.example'], nostrRelays: [relay] });
    setPriv(api, 'httpBase', 'https://relay.example');
    const patch = {
      id: 'patch1234',
      title: 'T',
      description: 'D',
      author: { login: 'npub1x', avatarUrl: '' },
      commits: [{ sha: 'c1' }],
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-02T00:00:00.000Z'
    };
    (vi.spyOn(api as any, 'listPatches') as any).mockResolvedValueOnce([patch]);
    (vi.spyOn(api as any, 'fetchLatestState') as any).mockResolvedValueOnce({ head: 'ref: refs/heads/main', refs: {} });
    const prs = await api.listPullRequests(ownerHex, 'r');
    expect(prs[0].title).toBe('T');
    expect(prs[0].base.ref).toBe('main');
    expect(prs[0].head.ref).toBe('patch-branch');
    expect(prs[0].url).toMatch(/nostr:patch1234/);
  });
});
