import { describe, it, expect, vi } from 'vitest';
import type { GitProvider } from '../../src/git/provider.js';
import { resolveBranchName } from '../../src/worker/workers/branches.js';

function makeGitMock(overrides: Partial<GitProvider> = {}): GitProvider {
  return {
    resolveRef: vi.fn().mockResolvedValue('deadbeef'),
    listBranches: vi.fn().mockResolvedValue(['main', 'dev']),
    ...overrides,
  } as unknown as GitProvider;
}

describe('worker/branches resolveBranchName', () => {
  it('returns requested branch when resolvable', async () => {
    const git = makeGitMock();
    const res = await resolveBranchName(git, '/dir', 'feature');
    expect(res).toBe('feature');
    expect((git.resolveRef as any)).toHaveBeenCalledWith({ dir: '/dir', ref: 'feature' });
  });

  it('returns requested branch when not found locally (for later sync)', async () => {
    const git = makeGitMock({
      resolveRef: vi.fn(async () => { throw new Error('nope'); }) as any,
    });
    const res = await resolveBranchName(git, '/dir', 'feat-x');
    expect(res).toBe('feat-x');
  });

  it('falls back to first available branch when none requested', async () => {
    const git = makeGitMock({
      resolveRef: vi.fn(async () => { throw new Error('nope'); }) as any,
      listBranches: vi.fn(async () => ['dev', 'main']) as any,
    });
    const res = await resolveBranchName(git, '/dir');
    expect(res).toBe('dev');
  });

  it('throws informative error when no branches available', async () => {
    const git = makeGitMock({
      resolveRef: vi.fn(async () => { throw new Error('nope'); }) as any,
      listBranches: vi.fn(async () => []) as any,
    });
    await expect(resolveBranchName(git, '/dir')).rejects.toThrow(/No branches found/i);
  });
});
