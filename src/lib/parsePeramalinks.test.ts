import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { fetchPermalink } from '$lib/git.js';
import git from 'isomorphic-git';
import { Buffer } from 'buffer';
import { parsePermalink, type PermalinkData } from './permalink.js';

// We'll mock isomorphic-git methods used in fetchSnippet
vi.mock('isomorphic-git', () => {
  return {
    __esModule: true,
    default: {},
    // We’ll stub the clone, readBlob, resolveRef calls:
    clone: vi.fn(),
    readBlob: vi.fn(),
    resolveRef: vi.fn()
  };
});

describe('parsePermalink', () => {
  it('should return null for invalid URL', () => {
    expect(parsePermalink('not a valid url')).toBeNull();
    expect(parsePermalink('ftp://something.com/owner/repo/blob/...')).toBeNull();
  });

  it('should return null if path is incomplete', () => {
    // e.g. missing the blob segment for GitHub
    expect(parsePermalink('https://github.com/owner/repo/zzz/master/file.ts')).toBeNull();
  });

  it('should parse a GitHub permalink with line range #L10-L20', () => {
    const url = 'https://github.com/Pleb5/flotilla-budabit/blob/cff7689/src/app.d.ts#L4-L11';
    const result = parsePermalink(url);
    expect(result).toEqual({
      host: 'github.com',
      platform: 'github',
      owner: 'Pleb5',
      repo: 'flotilla-budabit',
      branch: 'cff7689',
      filePath: 'src/app.d.ts',
      startLine: 4,
      endLine: 11
    });
  });

  it('should parse a GitLab permalink with short line range #L1-3', () => {
    // e.g. https://gitlab.gnome.org/GNOME/Incubator/papers/-/blob/300bc07c/libdocument/pps-annotation.c#L61-65
    const url =
      'https://gitlab.gnome.org/GNOME/Incubator/papers/-/blob/300bc07c888c6a5bd1bae46cdeadf87059c32fc2/libdocument/pps-annotation.c#L61-65';
    const result = parsePermalink(url);
    expect(result).toEqual({
      host: 'gitlab.gnome.org',
      platform: 'gitlab',
      owner: 'GNOME',
      // Because the code slices [1..blobIndex-1] => 'Incubator/papers/-' => We might only see 'Incubator/papers/-' or something simplified.
      // But your code in the snippet merges them into "Incubator/papers/-" for 'repo'. This test is matching your exact code.
      // If you want to handle deeper subgroups differently, you'd adapt the parsing logic and test accordingly.
      repo: 'Incubator/papers',
      branch: '300bc07c888c6a5bd1bae46cdeadf87059c32fc2',
      filePath: 'libdocument/pps-annotation.c',
      startLine: 61,
      endLine: 65
    });
  });

  it('should parse a Gitea permalink with #L7-L23 style', () => {
    const url =
      'https://gitea.com/nvmfst/firefox-stuff/src/commit/9ccf1c153ecb478210ae79d362f20baa25577829/bookmarks.xbel#L7-L23';
    const result = parsePermalink(url);
    expect(result).toEqual({
      host: 'gitea.com',
      platform: 'gitea',
      owner: 'nvmfst',
      repo: 'firefox-stuff',
      branch: '9ccf1c153ecb478210ae79d362f20baa25577829',
      filePath: 'bookmarks.xbel',
      startLine: 7,
      endLine: 23
    });
  });

  it('should handle single-line references', () => {
    const url = 'https://github.com/user/repo/blob/main/folder/file.ts#L42';
    const result = parsePermalink(url);
    expect(result).toEqual({
      host: 'github.com',
      platform: 'github',
      owner: 'user',
      repo: 'repo',
      branch: 'main',
      filePath: 'folder/file.ts',
      startLine: 42,
      endLine: undefined
    });
  });

  it('should return null for unrecognized platform host', () => {
    // e.g. bitbucket or something else
    expect(
      parsePermalink('https://bitbucket.org/owner/repo/src/abcdef/file.ts#L10-L20')
    ).toBeNull();
  });

  it('should parse normal GitHub link with no line range', () => {
    const url = 'https://github.com/owner/repo/blob/main/path/to/index.js';
    const result = parsePermalink(url);
    expect(result).toEqual({
      host: 'github.com',
      platform: 'github',
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      filePath: 'path/to/index.js',
      startLine: undefined,
      endLine: undefined
    });
  });
});

describe('fetchSnippet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should clone the repo if not cloned and then read snippet with line range', async () => {
    // Mock resolveRef to throw first time if HEAD is missing...
    // Actually we do that in isRepoCloned, but let's do simpler approach:
    (git.resolveRef as unknown as Mock).mockImplementationOnce(async () => {
      // isRepoCloned calls ref:'HEAD' => throw => means not cloned
      throw new Error('Not found');
    });
    // Next time we call resolveRef for data.branch => return a fake commit ID
    (git.resolveRef as unknown as Mock).mockImplementationOnce(async () => {
      return 'abcdef1234567890';
    });

    // mock readBlob to return some test content
    (git.readBlob as unknown as Mock).mockResolvedValue({
      blob: Buffer.from('line1\nline2\nline3\nline4\nline5', 'utf8')
    });

    const fakeData: PermalinkData = {
      host: 'github.com',
      platform: 'github',
      owner: 'user',
      repo: 'repo',
      branch: 'main',
      filePath: 'src/index.ts',
      startLine: 2,
      endLine: 4
    };

    const result = await fetchPermalink(fakeData);

    // Expect clone to have been called once (since HEAD check threw => not cloned)
    expect(git.clone).toHaveBeenCalledTimes(1);
    expect(git.clone).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: '/user/repo',
        url: 'https://github.com/user/repo.git',
        singleBranch: true,
        noCheckout: true,
        depth: 1
      })
    );

    // Expect readBlob to be called with commitOid
    expect(git.readBlob).toHaveBeenCalledWith({
      fs: expect.anything(),
      dir: '/user/repo',
      oid: 'abcdef1234567890',
      filepath: 'src/index.ts'
    });
    expect(result).toBe('line2\nline3\nline4');
  });

  it('should skip clone if isRepoCloned is true', async () => {
    // If HEAD is found => isRepoCloned returns true
    (git.resolveRef as unknown as Mock).mockResolvedValueOnce('somehead');
    // Then a second resolveRef for data.branch => 'abc'
    (git.resolveRef as unknown as Mock).mockResolvedValueOnce('abc');
    (git.readBlob as unknown as Mock).mockResolvedValue({
      blob: Buffer.from('somecontent', 'utf8')
    });

    const data: PermalinkData = {
      host: 'gitea.example.com',
      platform: 'gitea',
      owner: 'owner',
      repo: 'repo',
      branch: 'master',
      filePath: 'path/sub/file.txt'
    };

    const result = await fetchPermalink(data);

    // Because isRepoCloned returns true, no clone
    expect(git.clone).not.toHaveBeenCalled();
    // We do expect readBlob to happen with the second resolveRef => 'abc'
    expect(git.readBlob).toHaveBeenCalledWith({
      fs: expect.anything(),
      dir: '/owner/repo',
      oid: 'abc',
      filepath: 'path/sub/file.txt'
    });
    expect(result).toBe('somecontent');
  });

  it('should handle single-line snippet (only startLine)', async () => {
    // HEAD found => skip clone
    (git.resolveRef as unknown as Mock).mockResolvedValueOnce('abc123');
    (git.readBlob as unknown as Mock).mockResolvedValue({
      blob: Buffer.from('line1\nline2\nline3', 'utf8')
    });

    const data: PermalinkData = {
      host: 'github.com',
      platform: 'github',
      owner: 'u',
      repo: 'r',
      branch: 'main',
      filePath: 'something.ts',
      startLine: 2
    };
    const snippet = await fetchPermalink(data);
    expect(snippet).toBe('line2');
  });

  it('should return error message if readBlob throws', async () => {
    // HEAD found => skip clone
    (git.resolveRef as unknown as Mock).mockResolvedValueOnce('abc123');
    (git.readBlob as unknown as Mock).mockImplementationOnce(async () => {
      throw new Error('Blob not found');
    });

    const data: PermalinkData = {
      host: 'github.com',
      platform: 'github',
      owner: 'u',
      repo: 'r',
      branch: 'main',
      filePath: 'x'
    };
    const snippet = await fetchPermalink(data);
    expect(snippet).toBe('Error: Blob not found');
  });

  it('should handle unknown errors gracefully', async () => {
    (git.resolveRef as unknown as Mock).mockResolvedValueOnce('abc123');
    (git.readBlob as unknown as Mock).mockImplementationOnce(() => {
      // throw a non-Error object
      throw 'some weird string';
    });

    const data: PermalinkData = {
      host: 'gitea.com',
      platform: 'gitea',
      owner: 'o',
      repo: 'r',
      branch: 'master',
      filePath: 'f'
    };
    const snippet = await fetchPermalink(data);
    expect(snippet).toBe('An unknown error some weird string occurred.');
  });
});
