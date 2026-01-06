import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { GitHubApi } from '../../../src/api/providers/github.js';

const makeFetchOk = (json: any) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => json });
const makeFetchErr = (status = 404, text = 'Not Found') =>
  vi.fn().mockResolvedValue({ ok: false, status, text: async () => text });

describe('GitHubApi request/shape mapping', () => {
  const token = 't0k';
  const owner = 'octo';
  const repo = 'hello';

  const sampleRepo = {
    id: 123,
    name: repo,
    full_name: `${owner}/${repo}`,
    description: 'desc',
    default_branch: 'main',
    private: true,
    clone_url: 'https://github.com/octo/hello.git',
    html_url: 'https://github.com/octo/hello',
    owner: { login: owner, type: 'User' },
  };

  let origFetch: any;
  beforeEach(() => {
    origFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('getRepo maps fields and sends auth headers', async () => {
    globalThis.fetch = makeFetchOk(sampleRepo) as any;
    const api = new GitHubApi(token);
    const data = await api.getRepo(owner, repo);
    expect(data.id).toBe(String(sampleRepo.id));
    expect(data.defaultBranch).toBe('main');
    expect(data.isPrivate).toBe(true);
    // header verification
    expect((globalThis.fetch as any).mock.calls[0][0]).toMatch('/repos/octo/hello');
    const init = (globalThis.fetch as any).mock.calls[0][1];
    expect(init.headers.Authorization).toBe(`token ${token}`);
    expect(init.headers.Accept).toContain('github');
    expect(init.headers['User-Agent']).toBe('nostr-git-client');
  });

  it('respects baseUrl override', async () => {
    globalThis.fetch = makeFetchOk(sampleRepo) as any;
    const api = new GitHubApi(token, 'https://example.api');
    await api.getRepo(owner, repo);
    const url = (globalThis.fetch as any).mock.calls[0][0];
    expect(url).toBe('https://example.api/repos/octo/hello');
  });

  it('propagates error text when response not ok', async () => {
    globalThis.fetch = makeFetchErr(500, 'boom') as any;
    const api = new GitHubApi(token);
    await expect(api.getRepo(owner, repo)).rejects.toThrow(/GitHub API error 500: boom/);
  });
});
