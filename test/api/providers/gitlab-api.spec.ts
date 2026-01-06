import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { GitLabApi } from '../../../src/api/providers/gitlab.js';

const makeFetchOk = (json: any) => vi.fn().mockResolvedValue({ ok: true, json: async () => json });
const makeFetchErr = (status = 404, text = 'Not Found') => vi.fn().mockResolvedValue({ ok: false, status, text: async () => text });

describe('GitLabApi request/shape mapping', () => {
  const token = 'gl_token';
  const owner = 'group';
  const repo = 'app';

  const project = {
    id: 777,
    name: repo,
    path_with_namespace: `${owner}/${repo}`,
    description: 'desc',
    default_branch: 'main',
    visibility: 'private',
    http_url_to_repo: 'https://gitlab.com/group/app.git',
    web_url: 'https://gitlab.com/group/app',
    namespace: { path: owner, kind: 'group' },
  };

  let origFetch: any;
  beforeEach(() => { origFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = origFetch; vi.restoreAllMocks(); });

  it('getRepo maps fields and sends Bearer auth; respects baseUrl', async () => {
    globalThis.fetch = makeFetchOk(project) as any;
    const api = new GitLabApi(token, 'https://gitlab.example/api/v4');
    const data = await api.getRepo(owner, repo);
    expect(data.id).toBe(String(project.id));
    expect(data.fullName).toBe(project.path_with_namespace);
    const url = (globalThis.fetch as any).mock.calls[0][0];
    expect(url).toBe('https://gitlab.example/api/v4/projects/' + encodeURIComponent(`${owner}/${repo}`));
    const init = (globalThis.fetch as any).mock.calls[0][1];
    expect(init.headers.Authorization).toBe(`Bearer ${token}`);
  });

  it('propagates error text when response not ok', async () => {
    globalThis.fetch = makeFetchErr(500, 'boom') as any;
    const api = new GitLabApi(token);
    await expect(api.getRepo(owner, repo)).rejects.toThrow(/GitLab API error 500: boom/);
  });

  it('listBranches maps name and commit id/url', async () => {
    const branches = [
      { name: 'main', commit: { id: 'abc', web_url: 'u1' } },
      { name: 'dev', commit: { id: 'def', web_url: 'u2' } },
    ];
    globalThis.fetch = makeFetchOk(branches) as any;
    const api = new GitLabApi(token);
    const out = await api.listBranches(owner, repo);
    expect(out).toEqual([
      { name: 'main', commit: { sha: 'abc', url: 'u1' } },
      { name: 'dev', commit: { sha: 'def', url: 'u2' } },
    ]);
  });

  it('getFileContent returns content/encoding/sha (blob_id)', async () => {
    const payload = { content: 'Y29udGVudA==', encoding: 'base64', blob_id: 'sha123' };
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new GitLabApi(token);
    const res = await api.getFileContent(owner, repo, 'README.md', 'main');
    expect(res.encoding).toBe('base64');
    expect(res.sha).toBe('sha123');
    expect(res.content).toBe('Y29udGVudA==');
  });

  it('getFileContent propagates error text when response not ok', async () => {
    globalThis.fetch = makeFetchErr(404, 'nope') as any;
    const api = new GitLabApi(token);
    await expect(api.getFileContent(owner, repo, 'missing.txt')).rejects.toThrow(/GitLab API error 404: nope/);
  });

  it('listPullRequests maps state and head/base fields', async () => {
    const payload = [
      {
        iid: 10,
        title: 'MR title',
        description: 'body',
        state: 'opened',
        author: { username: 'alice', avatar_url: 'a.png' },
        source_branch: 'feat',
        sha: 'abc',
        source_project_id: 1,
        target_branch: 'main',
        target_project_id: 2,
        merge_status: 'can_be_merged',
        merged_at: null,
        created_at: '2020-01-01',
        updated_at: '2020-01-02',
        web_url: 'https://gitlab.com/g/a/-/merge_requests/10'
      }
    ];
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new GitLabApi(token);
    const out = await api.listPullRequests(owner, repo, { state: 'open' });
    expect(out[0]).toMatchObject({
      number: 10,
      state: 'open',
      head: { ref: 'feat', sha: 'abc' },
      base: { ref: 'main' },
      mergeable: true,
      merged: false,
    });
  });

  it('getPullRequest maps merged state and base fields', async () => {
    const payload = {
      iid: 11,
      title: 'MR2',
      description: 'd',
      state: 'merged',
      author: { username: 'bob', avatar_url: 'b.png' },
      source_branch: 'fix',
      sha: '111',
      source_project_id: 1,
      target_branch: 'main',
      target_project_id: 2,
      merge_status: 'can_be_merged',
      merged_at: '2020-02-02',
      created_at: '2020-02-01',
      updated_at: '2020-02-02',
      web_url: 'w'
    };
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new GitLabApi(token);
    const out = await api.getPullRequest(owner, repo, 11);
    expect(out.merged).toBe(true);
    expect(out.state).toBe('merged');
    expect(out.base.ref).toBe('main');
  });

  it('getPullRequest propagates errors', async () => {
    globalThis.fetch = makeFetchErr(500, 'bad') as any;
    const api = new GitLabApi(token);
    await expect(api.getPullRequest(owner, repo, 1)).rejects.toThrow(/GitLab API error 500: bad/);
  });

  it('listPullRequests propagates errors', async () => {
    globalThis.fetch = makeFetchErr(502, 'bad gateway') as any;
    const api = new GitLabApi(token);
    await expect(api.listPullRequests(owner, repo)).rejects.toThrow(/GitLab API error 502: bad gateway/);
  });

  it('createPullRequest propagates errors', async () => {
    globalThis.fetch = makeFetchErr(400, 'invalid') as any;
    const api = new GitLabApi(token);
    await expect(
      api.createPullRequest(owner, repo, { title: 't', body: 'b', head: 'h', base: 'm' })
    ).rejects.toThrow(/GitLab API error 400: invalid/);
  });

  it('listIssues maps fields including author, assignees and labels', async () => {
    const payload = [
      {
        iid: 3,
        title: 'Bug',
        description: 'desc',
        state: 'opened',
        author: { username: 'alice', avatar_url: 'a.png' },
        assignees: [{ username: 'bob', avatar_url: 'b.png' }],
        labels: ['bug', 'high'],
        created_at: '2020-01-01',
        updated_at: '2020-01-02',
        closed_at: null,
        web_url: 'https://gitlab.com/g/a/-/issues/3'
      }
    ];
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new GitLabApi(token);
    const out = await api.listIssues(owner, repo, { state: 'open' });
    expect(out[0]).toMatchObject({
      id: 3,
      number: 3,
      title: 'Bug',
      body: 'desc',
      state: 'open',
      author: { login: 'alice', avatarUrl: 'a.png' },
      assignees: [{ login: 'bob', avatarUrl: 'b.png' }],
      labels: [{ name: 'bug' }, { name: 'high' }],
      url: 'https://gitlab.com/g/a/-/issues/3',
      htmlUrl: 'https://gitlab.com/g/a/-/issues/3'
    });
  });

  it('getIssue maps fields including labels and dates', async () => {
    const payload = {
      iid: 4,
      title: 'Feature',
      description: 'body',
      state: 'closed',
      author: { username: 'eve', avatar_url: 'e.png' },
      assignees: [],
      labels: ['feat'],
      created_at: '2020-02-01',
      updated_at: '2020-02-02',
      closed_at: '2020-02-03',
      web_url: 'https://gitlab.com/g/a/-/issues/4'
    };
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new GitLabApi(token);
    const out = await api.getIssue(owner, repo, 4);
    expect(out.state).toBe('closed');
    expect(out.labels[0].name).toBe('feat');
    expect(out.htmlUrl).toContain('/issues/4');
  });

  it('listIssues propagates errors', async () => {
    globalThis.fetch = makeFetchErr(503, 'unavailable') as any;
    const api = new GitLabApi(token);
    await expect(api.listIssues(owner, repo)).rejects.toThrow(/GitLab API error 503: unavailable/);
  });
});
