import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { BitbucketApi } from '../../../src/api/providers/bitbucket.js';

const makeFetchOk = (json: any) => vi.fn().mockResolvedValue({ ok: true, json: async () => json });
const makeFetchErr = (status = 404, text = 'Not Found') => vi.fn().mockResolvedValue({ ok: false, status, text: async () => text });

describe('BitbucketApi request/shape mapping', () => {
  const token = 'bb_token';
  const owner = 'team';
  const repo = 'proj';

  const bbRepo = {
    uuid: '{uuid}',
    name: repo,
    full_name: `${owner}/${repo}`,
    description: 'd',
    mainbranch: { name: 'main' },
    is_private: true,
    links: {
      clone: [{ name: 'https', href: 'https://bitbucket.org/team/proj.git' }],
      html: { href: 'https://bitbucket.org/team/proj' },
    },
    owner: { username: owner, type: 'team' },
  };

  let origFetch: any;
  beforeEach(() => { origFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = origFetch; vi.restoreAllMocks(); });

  it('getRepo maps fields and sends Bearer auth', async () => {
    globalThis.fetch = makeFetchOk(bbRepo) as any;
    const api = new BitbucketApi(token);
    const data = await api.getRepo(owner, repo);
    expect(data.id).toBe('{uuid}');
    expect(data.defaultBranch).toBe('main');
    expect(data.isPrivate).toBe(true);
    const init = (globalThis.fetch as any).mock.calls[0][1];
    expect(init.headers.Authorization).toBe(`Bearer ${token}`);
  });

  it('getCommit maps author/committer, parents and urls', async () => {
    const payload = {
      hash: 'c1',
      message: 'm',
      author: { raw: 'A <a@e>', user: { display_name: 'A', email: 'a@e' } },
      date: '2020-01-01',
      links: { self: { href: 'u' }, html: { href: 'h' } },
      parents: [{ hash: 'p1', links: { self: { href: 'pu1' } } }]
    };
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new BitbucketApi(token);
    const out = await api.getCommit(owner, repo, 'c1');
    expect(out.sha).toBe('c1');
    expect(out.author.name).toBe('A');
    expect(out.committer.name).toBe('A');
    expect(out.parents[0].sha).toBe('p1');
    expect(out.url).toBe('u');
    expect(out.htmlUrl).toBe('h');
  });

  it('listCommits maps array and passes include/pagelen params', async () => {
    const payload = {
      values: [
        {
          hash: 'c1',
          message: 'm',
          author: { raw: 'A <a@e>', user: { display_name: 'A', email: 'a@e' } },
          date: '2020-01-01',
          links: { self: { href: 'u' }, html: { href: 'h' } },
          parents: [{ hash: 'p1', links: { self: { href: 'pu1' } } }]
        }
      ]
    };
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new BitbucketApi(token);
    const out = await api.listCommits(owner, repo, { sha: 'main', per_page: 1 });
    expect(out[0].sha).toBe('c1');
    expect(out[0].parents[0].sha).toBe('p1');
    const url = (globalThis.fetch as any).mock.calls[0][0];
    expect(url).toMatch(/commits\?include=main&pagelen=1/);
  });

  it('respects baseUrl override for request URL', async () => {
    globalThis.fetch = makeFetchOk(bbRepo) as any;
    const api = new BitbucketApi(token, 'https://bb.example/2.0');
    await api.getRepo(owner, repo);
    const url = (globalThis.fetch as any).mock.calls[0][0];
    expect(url).toBe('https://bb.example/2.0/repositories/team/proj');
  });

  it('propagates error text when response not ok', async () => {
    globalThis.fetch = makeFetchErr(500, 'boom') as any;
    const api = new BitbucketApi(token);
    await expect(api.getRepo(owner, repo)).rejects.toThrow(/Bitbucket API error 500: boom/);
  });

  it('listBranches maps name and target hash/url', async () => {
    const payload = {
      values: [
        { name: 'main', target: { hash: 'abc', links: { self: { href: 'u1' } } } },
        { name: 'dev', target: { hash: 'def', links: { self: { href: 'u2' } } } },
      ]
    };
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new BitbucketApi(token);
    const out = await api.listBranches(owner, repo);
    expect(out).toEqual([
      { name: 'main', commit: { sha: 'abc', url: 'u1' } },
      { name: 'dev', commit: { sha: 'def', url: 'u2' } },
    ]);
  });

  it('getFileContent returns base64 content and no sha', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => 'hello' }) as any;
    const api = new BitbucketApi(token);
    const res = await api.getFileContent(owner, repo, 'README.md', 'main');
    expect(res.encoding).toBe('base64');
    expect(res.sha).toBe('');
    expect(res.content).toBe(Buffer.from('hello', 'utf8').toString('base64'));
  });

  it('getFileContent propagates error text when response not ok', async () => {
    globalThis.fetch = makeFetchErr(404, 'nope') as any;
    const api = new BitbucketApi(token);
    await expect(api.getFileContent(owner, repo, 'missing.txt')).rejects.toThrow(/Bitbucket API error 404: nope/);
  });

  it('listTags maps name and target hash/url', async () => {
    const payload = {
      values: [
        { name: 'v1.0.0', target: { hash: 't1', links: { self: { href: 'tu1' } } } },
        { name: 'v1.1.0', target: { hash: 't2', links: { self: { href: 'tu2' } } } },
      ]
    };
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new BitbucketApi(token);
    const out = await api.listTags(owner, repo);
    expect(out).toEqual([
      { name: 'v1.0.0', commit: { sha: 't1', url: 'tu1' } },
      { name: 'v1.1.0', commit: { sha: 't2', url: 'tu2' } },
    ]);
  });

  it('getTag maps fields and constructs archive URLs', async () => {
    const payload = {
      name: 'v2.0.0',
      target: { hash: 'th', links: { self: { href: 'turl' } } },
    };
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new BitbucketApi(token, 'https://api.bitbucket.org/2.0');
    const out = await api.getTag(owner, repo, 'v2.0.0');
    expect(out.name).toBe('v2.0.0');
    expect(out.commit.sha).toBe('th');
    expect(out.zipballUrl).toBe('https://api.bitbucket.org/2.0/repositories/team/proj/downloads/v2.0.0.zip');
    expect(out.tarballUrl).toBe('https://api.bitbucket.org/2.0/repositories/team/proj/downloads/v2.0.0.tar.gz');
  });

  it('listPullRequests maps shape including state and head/base', async () => {
    const payload = {
      values: [
        {
          id: 5,
          title: 'Add feature',
          description: 'desc',
          state: 'OPEN',
          author: { username: 'alice', links: { avatar: { href: 'a.png' } } },
          source: { branch: { name: 'feat' }, commit: { hash: 'abc' }, repository: { name: 'proj', owner: { username: 'team' } } },
          destination: { branch: { name: 'main' }, commit: { hash: 'def' }, repository: { name: 'proj', owner: { username: 'team' } } },
          links: { self: { href: 'self' }, html: { href: 'html' }, diff: { href: 'diff' } },
          created_on: '2020-01-01',
          updated_on: '2020-01-02',
        }
      ]
    };
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new BitbucketApi(token);
    const out = await api.listPullRequests(owner, repo, { state: 'open' });
    expect(out[0]).toMatchObject({
      number: 5,
      state: 'open',
      head: { ref: 'feat', sha: 'abc', repo: { name: 'proj', owner: 'team' } },
      base: { ref: 'main', sha: 'def', repo: { name: 'proj', owner: 'team' } },
      mergeable: true,
      merged: false,
    });
  });

  it('getPullRequest maps shape including merged/closed states', async () => {
    const payload = {
      id: 7,
      title: 'Bugfix',
      description: 'd',
      state: 'MERGED',
      author: { username: 'bob', links: { avatar: { href: 'b.png' } } },
      source: { branch: { name: 'fix' }, commit: { hash: '111' }, repository: { name: 'proj', owner: { username: 'team' } } },
      destination: { branch: { name: 'main' }, commit: { hash: '222' }, repository: { name: 'proj', owner: { username: 'team' } } },
      links: { self: { href: 's' }, html: { href: 'h' }, diff: { href: 'd' } },
      created_on: '2020-02-01',
      updated_on: '2020-02-02',
    };
    globalThis.fetch = makeFetchOk(payload) as any;
    const api = new BitbucketApi(token);
    const out = await api.getPullRequest(owner, repo, 7);
    expect(out.merged).toBe(true);
    expect(out.state).toBe('merged');
    expect(out.base.ref).toBe('main');
  });

  it('listTags propagates errors', async () => {
    globalThis.fetch = makeFetchErr(500, 'oops') as any;
    const api = new BitbucketApi(token);
    await expect(api.listTags(owner, repo)).rejects.toThrow(/Bitbucket API error 500: oops/);
  });

  it('getTag propagates errors', async () => {
    globalThis.fetch = makeFetchErr(403, 'forbidden') as any;
    const api = new BitbucketApi(token);
    await expect(api.getTag(owner, repo, 'v1')).rejects.toThrow(/Bitbucket API error 403: forbidden/);
  });

  it('listPullRequests propagates errors', async () => {
    globalThis.fetch = makeFetchErr(502, 'bad gateway') as any;
    const api = new BitbucketApi(token);
    await expect(api.listPullRequests(owner, repo)).rejects.toThrow(/Bitbucket API error 502: bad gateway/);
  });

  it('getPullRequest propagates errors', async () => {
    globalThis.fetch = makeFetchErr(404, 'missing') as any;
    const api = new BitbucketApi(token);
    await expect(api.getPullRequest(owner, repo, 123)).rejects.toThrow(/Bitbucket API error 404: missing/);
  });
});
