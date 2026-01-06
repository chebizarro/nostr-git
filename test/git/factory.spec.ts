import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { getGitProvider } from '../../src/git/factory.js';

describe('git/factory getGitProvider', () => {
  it('returns a singleton provider instance', () => {
    const p1 = getGitProvider({ cacheMode: 'off' } as any);
    const p2 = getGitProvider({ cacheMode: 'off' } as any);
    expect(p1).toBe(p2);
    expect(typeof (p1 as any).listBranches).toBe('function');
  });

  it('provider is truthy and exposes basic git methods', () => {
    const p = getGitProvider() as any;
    expect(p).toBeTruthy();
    expect(typeof p.clone).toBe('function');
  });
});
