import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { GiteaApi } from '../../../src/api/providers/gitea.js';

const makeFetchOk = (json: any) => vi.fn().mockResolvedValue({ ok: true, json: async () => json });
const makeFetchErr = (status = 404, text = 'Not Found') => vi.fn().mockResolvedValue({ ok: false, status, text: async () => text });

describe('GiteaApi request/shape mapping', () => {
  const token = 'gt_token';
  const owner = 'o';
  const repo = 'r';

  const meta = {
    id: 42,
    name: repo,
    full_name: `${owner}/${repo}`,
    description: 'd',
    default_branch: 'main',
    private: true,
    clone_url: 'https://gitea.example/o/r.git',
    html_url: 'https://gitea.example/o/r',
    owner: { login: owner, type: 'User' },
  };

  let origFetch: any;
  beforeEach(() => { origFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = origFetch; vi.restoreAllMocks(); });

  it('requires baseUrl and maps getRepo; sends token auth header', async () => {
    // Constructor requires baseUrl
    expect(() => new GiteaApi(token)).toThrow(/requires a base URL/);

    globalThis.fetch = makeFetchOk(meta) as any;
    const api = new GiteaApi(token, 'https://gitea.example/api/v1');
    const data = await api.getRepo(owner, repo);
    expect(data.id).toBe(String(meta.id));
    const url = (globalThis.fetch as any).mock.calls[0][0];
    expect(url).toBe('https://gitea.example/api/v1/repos/o/r');
    const init = (globalThis.fetch as any).mock.calls[0][1];
    expect(init.headers.Authorization).toBe(`token ${token}`);
  });

  it('propagates error text when response not ok', async () => {
    globalThis.fetch = makeFetchErr(500, 'fail') as any;
    const api = new GiteaApi(token, 'https://gitea.example/api/v1');
    await expect(api.getRepo(owner, repo)).rejects.toThrow(/Gitea API error 500: fail/);
  });

  it('listBranches maps name and commit id/url', async () => {
    const payload = [
      { name: 'main', commit: { id: 'abc', url: 'u1' } },
      { name: 'dev', commit: { id: 'def', url: 'u2' } },
    ];
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new GiteaApi(token, 'https://gitea.example/api/v1');
    const out = await api.listBranches(owner, repo);
    expect(out).toEqual([
      { name: 'main', commit: { sha: 'abc', url: 'u1' } },
      { name: 'dev', commit: { sha: 'def', url: 'u2' } },
    ]);
  });

  it('getFileContent returns content/encoding/sha', async () => {
    const payload = { content: 'YQ==', encoding: 'base64', sha: 'dead' };
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new GiteaApi(token, 'https://gitea.example/api/v1');
    const res = await api.getFileContent(owner, repo, 'README.md', 'main');
    expect(res.encoding).toBe('base64');
    expect(res.sha).toBe('dead');
    expect(res.content).toBe('YQ==');
  });

  it('getFileContent propagates error text when response not ok', async () => {
    globalThis.fetch = makeFetchErr(404, 'nope') as any;
    const api = new GiteaApi(token, 'https://gitea.example/api/v1');
    await expect(api.getFileContent(owner, repo, 'missing.txt')).rejects.toThrow(/Gitea API error 404: nope/);
  });

  it('listIssues maps fields including author, assignees, labels', async () => {
    const payload = [
      {
        id: 9,
        number: 9,
        title: 'Bug',
        body: 'desc',
        state: 'open',
        user: { login: 'alice', avatar_url: 'a.png' },
        assignees: [{ login: 'bob', avatar_url: 'b.png' }],
        labels: [{ name: 'bug', color: 'f00', description: 'red' }],
        created_at: '2020-01-01',
        updated_at: '2020-01-02',
        closed_at: null,
        url: 'u',
        html_url: 'h'
      }
    ];
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new GiteaApi(token, 'https://gitea.example/api/v1');
    const out = await api.listIssues(owner, repo, { state: 'open' });
    expect(out[0]).toMatchObject({
      id: 9,
      number: 9,
      title: 'Bug',
      body: 'desc',
      state: 'open',
      author: { login: 'alice', avatarUrl: 'a.png' },
      assignees: [{ login: 'bob', avatarUrl: 'b.png' }],
      labels: [{ name: 'bug', color: 'f00', description: 'red' }],
      url: 'u',
      htmlUrl: 'h'
    });
  });

  it('getIssue maps fields (state, labels, dates)', async () => {
    const payload = {
      id: 10,
      number: 10,
      title: 'Feature',
      body: 'body',
      state: 'closed',
      user: { login: 'eve', avatar_url: 'e.png' },
      assignees: [],
      labels: [{ name: 'feat', color: '0f0', description: '' }],
      created_at: '2020-02-01',
      updated_at: '2020-02-02',
      closed_at: '2020-02-03',
      url: 'u2',
      html_url: 'h2'
    };
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new GiteaApi(token, 'https://gitea.example/api/v1');
    const out = await api.getIssue(owner, repo, 10);
    expect(out.state).toBe('closed');
    expect(out.labels[0].name).toBe('feat');
    expect(out.htmlUrl).toBe('h2');
  });

  it('listIssues propagates errors', async () => {
    globalThis.fetch = makeFetchErr(500, 'oops') as any;
    const api = new GiteaApi(token, 'https://gitea.example/api/v1');
    await expect(api.listIssues(owner, repo)).rejects.toThrow(/Gitea API error 500: oops/);
  });
});
