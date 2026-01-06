import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import {
  detectVendorFromUrl,
  extractHostname,
  normalizeGitUrl,
} from '../../src/git/vendor-providers.js';

describe('vendor-providers utilities', () => {
  it('detectVendorFromUrl covers github, gitlab subdomain, gitea subdomain, bitbucket subdomain, grasp ws://, and generic fallback', () => {
    expect(detectVendorFromUrl('https://github.com/a/b')).toBe('github');
    expect(detectVendorFromUrl('https://gitlab.example.com/a/b')).toBe('gitlab');
    expect(detectVendorFromUrl('https://gitea.example.org/a/b')).toBe('gitea');
    expect(detectVendorFromUrl('https://bitbucket.example.net/a/b')).toBe('bitbucket');
    expect(detectVendorFromUrl('wss://relay.example')).toBe('grasp');
    expect(detectVendorFromUrl('https://unknown.example/a/b')).toBe('generic');
  });

  it('extractHostname handles ssh, https and invalid gracefully', () => {
    expect(extractHostname('git@github.com:owner/repo.git')).toBe('github.com');
    expect(extractHostname('https://gitlab.example.com/owner/repo')).toBe('gitlab.example.com');
    expect(extractHostname('not a url')).toBe('');
  });

  it('normalizeGitUrl converts ssh to https and appends .git when missing', () => {
    expect(normalizeGitUrl('git@github.com:owner/repo.git')).toBe('https://github.com/owner/repo.git');
    expect(normalizeGitUrl('https://example.com/owner/repo')).toBe('https://example.com/owner/repo.git');
    expect(normalizeGitUrl('https://example.com/owner/repo.git')).toBe('https://example.com/owner/repo.git');
  });
});
