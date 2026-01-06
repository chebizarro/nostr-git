import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import { resolveRobustBranch } from '../../src/worker/workers/branches.js';

function makeGit(mocks: any) {
  return {
    resolveRef: async ({ ref }: any) => {
      if (mocks.resolveRefError?.has(ref)) throw new Error('not found');
      return mocks.refs?.[ref] || 'oid';
    },
    listBranches: async () => mocks.branchList ?? [],
  } as any;
}

describe('worker/branches resolveRobustBranch', () => {
  it('returns requestedBranch if it resolves', async () => {
    const git = makeGit({});
    const res = await resolveRobustBranch(git, '/repo', 'feature');
    expect(res).toBe('feature');
  });

  it('returns requestedBranch even if resolveRef throws (caller will sync)', async () => {
    const git = makeGit({ resolveRefError: new Set(['feat']) });
    const res = await resolveRobustBranch(git, '/repo', 'feat');
    expect(res).toBe('feat');
  });

  it('falls back to known names when none requested', async () => {
    const git = makeGit({
      resolveRefError: new Set(['main', 'master', 'develop']),
      refs: { dev: 'abc' },
    });
    const res = await resolveRobustBranch(git, '/repo');
    expect(res).toBe('dev');
  });

  it('uses first available from listBranches when specific fallbacks fail', async () => {
    const git = makeGit({
      resolveRefError: new Set(['main', 'master', 'develop', 'dev']),
      branchList: ['trunk', 'release'],
    });
    const res = await resolveRobustBranch(git, '/repo');
    expect(res).toBe('trunk');
  });

  it('throws when listBranches fails', async () => {
    const git: any = {
      resolveRef: async () => { throw new Error('nope'); },
      listBranches: async () => { throw new Error('boom'); },
    };
    await expect(resolveRobustBranch(git, '/repo')).rejects.toBeInstanceOf(Error);
  });
});
