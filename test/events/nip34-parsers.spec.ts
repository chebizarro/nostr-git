import { describe, it, expect } from 'vitest';
import type { RepoAnnouncementEvent, RepoStateEvent, IssueEvent, PullRequestEvent, PullRequestUpdateEvent, StatusEvent, PatchEvent } from '../../src/events/nip34/nip34.js';
import {
  createRepoAnnouncementEvent,
  createRepoStateEvent,
  createIssueEvent,
  createPullRequestEvent,
  createPullRequestUpdateEvent,
  createStatusEvent,
  createPatchEvent,
  parseRepoAnnouncementEvent,
  parseRepoStateEvent,
  parseIssueEvent,
  parsePullRequestEvent,
  parsePullRequestUpdateEvent,
  parseStatusEvent,
  parsePatchEvent,
  getTagValue,
  getTags
} from '../../src/events/nip34/nip34-utils.js';
import { parseGitPatchFromEvent } from '../../src/git/patches.js';

function withMeta<T extends { created_at?: number; pubkey?: string; id?: string; sig?: string }>(
  evt: T,
  meta: { created_at: number; pubkey: string; id: string }
): T {
  return Object.assign(evt, meta);
}

describe('NIP-34 parsers (nip34-utils)', () => {
  it('parseRepoAnnouncementEvent parses full tags and derived address', () => {
    const built = createRepoAnnouncementEvent({
      repoId: 'owner/name',
      name: 'Repo Name',
      description: 'desc',
      clone: ['https://example.com/repo.git'],
      web: ['https://example.com'],
      relays: ['wss://relay.example.com/'],
      maintainers: ['npub1m'],
      hashtags: ['bug'],
      earliestUniqueCommit: 'euc-1',
      created_at: 1700000100
    });

    const evt = withMeta(built as any as RepoAnnouncementEvent, {
      created_at: 1700000100,
      pubkey: 'owner-pk',
      id: 'ann-1'
    });

    const parsed = parseRepoAnnouncementEvent(evt);
    expect(parsed.id).toBe('ann-1');
    expect(parsed.repoId).toBe('name');
    expect(parsed.address).toBe(`30617:owner-pk:name`);
    expect(parsed.name).toBe('Repo Name');
    expect(parsed.description).toBe('desc');
    expect(parsed.clone).toEqual(['https://example.com/repo.git']);
    expect(parsed.web).toEqual(['https://example.com']);
    expect(parsed.relays?.every((r) => !r.endsWith('/'))).toBe(true);
    expect(parsed.maintainers).toEqual(['npub1m']);
    expect(parsed.hashtags).toEqual(['bug']);
    expect(parsed.earliestUniqueCommit).toBe('euc-1');
    expect(parsed.createdAt).toBe(new Date(1700000100 * 1000).toISOString());
  });

  it('parseRepoAnnouncementEvent handles missing optional tags gracefully', () => {
    const built = createRepoAnnouncementEvent({
      repoId: 'owner/name',
      created_at: 1700000101
    });

    const evt = withMeta(built as any as RepoAnnouncementEvent, {
      created_at: 1700000101,
      pubkey: 'owner-pk',
      id: 'ann-2'
    });

    const parsed = parseRepoAnnouncementEvent(evt);
    expect(parsed.repoId).toBe('name');
    expect(parsed.name).toBeUndefined();
    expect(parsed.description).toBeUndefined();
    expect(parsed.web).toEqual([]);
    expect(parsed.clone).toEqual([]);
    expect(parsed.relays).toEqual([]);
    expect(parsed.maintainers).toEqual([]);
    expect(parsed.hashtags).toEqual([]);
    expect(parsed.earliestUniqueCommit).toBeUndefined();
  });

  it('parseRepoStateEvent parses refs and head', () => {
    const built = createRepoStateEvent({
      repoId: 'owner/name',
      refs: [
        { type: 'heads', name: 'main', commit: 'c1' },
        { type: 'tags', name: 'v1', commit: 't1', ancestry: ['a1'] }
      ],
      head: 'main',
      created_at: 1700000200
    });

    const evt = withMeta(built as any as RepoStateEvent, {
      created_at: 1700000200,
      pubkey: 'owner-pk',
      id: 'state-1'
    });

    const parsed = parseRepoStateEvent(evt);
    expect(parsed.id).toBe('state-1');
    expect(parsed.repoId).toBe('owner/name');
    expect(parsed.refs).toEqual(
      expect.arrayContaining([
        { ref: 'refs/heads/main', commit: 'c1', lineage: undefined },
        { ref: 'refs/tags/v1', commit: 't1', lineage: ['a1'] }
      ])
    );
    expect(parsed.head).toBe('ref: refs/heads/main');
  });

  it('parseIssueEvent handles missing optional tags and labels', () => {
    const built = createIssueEvent({
      content: 'issue',
      repoAddr: '30617:pk:repo',
      created_at: 1700000300
    });

    const evt = withMeta(built as any as IssueEvent, {
      created_at: 1700000300,
      pubkey: 'author-pk',
      id: 'issue-1'
    });

    const parsed = parseIssueEvent(evt);
    expect(parsed.id).toBe('issue-1');
    expect(parsed.repoId).toBe('30617:pk:repo');
    expect(parsed.subject).toBe('');
    expect(parsed.labels).toEqual([]);
  });

  it('parsePullRequestEvent parses commits, labels and optional fields', () => {
    const built = createPullRequestEvent({
      content: 'pr',
      repoAddr: '30617:pk:repo',
      subject: 'PR',
      labels: ['enhancement'],
      commits: ['c1', 'c2'],
      branchName: 'feature/x',
      mergeBase: 'mb',
      created_at: 1700000400
    });

    const evt = withMeta(built as any as PullRequestEvent, {
      created_at: 1700000400,
      pubkey: 'author-pk',
      id: 'pr-1'
    });

    const parsed = parsePullRequestEvent(evt);
    expect(parsed.id).toBe('pr-1');
    expect(parsed.repoId).toBe('30617:pk:repo');
    expect(parsed.subject).toBe('PR');
    expect(parsed.labels).toEqual(['enhancement']);
    expect(parsed.commits).toEqual(['c1', 'c2']);
    expect(parsed.branchName).toBe('feature/x');
    expect(parsed.mergeBase).toBe('mb');
  });

  it('parsePullRequestUpdateEvent parses commits and merge base', () => {
    const built = createPullRequestUpdateEvent({
      repoAddr: '30617:pk:repo',
      commits: ['c1'],
      mergeBase: 'mb',
      created_at: 1700000500
    });

    const evt = withMeta(built as any as PullRequestUpdateEvent, {
      created_at: 1700000500,
      pubkey: 'author-pk',
      id: 'pru-1'
    });

    const parsed = parsePullRequestUpdateEvent(evt);
    expect(parsed.id).toBe('pru-1');
    expect(parsed.repoId).toBe('30617:pk:repo');
    expect(parsed.commits).toEqual(['c1']);
    expect(parsed.mergeBase).toBe('mb');
  });

  it('parseStatusEvent maps kind to status and extracts related ids', () => {
    const built = createStatusEvent({
      kind: 1631,
      content: 'applied/merged',
      rootId: 'root-id',
      created_at: 1700000600
    });

    const evt = withMeta(built as any as StatusEvent, {
      created_at: 1700000600,
      pubkey: 'author-pk',
      id: 'st-1'
    });

    const parsed = parseStatusEvent(evt);
    expect(parsed.id).toBe('st-1');
    expect(parsed.status).toBe('applied');
    expect(parsed.relatedIds).toEqual(expect.arrayContaining(['root-id']));
  });

  it('parsePatchEvent does not throw on missing optional tags and produces ISO timestamps', () => {
    const built = createPatchEvent({
      content: 'patch content',
      repoAddr: '30617:pk:repo',
      created_at: 1700000700
    });

    const evt = withMeta(built as any as PatchEvent, {
      created_at: 1700000700,
      pubkey: 'author-pk',
      id: 'patch-1'
    });

    const parsed = parsePatchEvent(evt as any);
    expect(parsed.id).toBe('patch-1');
    expect(parsed.repoId).toBe('30617:pk:repo');
    expect(parsed.createdAt).toBe(new Date(1700000700 * 1000).toISOString());
  });

  it('parsers handle malformed tags without crashing (graceful degradation)', () => {
    const malformed: any = {
      id: 'bad-1',
      pubkey: 'pk',
      created_at: 1700000800,
      kind: 30617,
      content: '',
      tags: [
        ['d'], // missing value
        ['clone'], // empty multi
        ['relays', 'wss://relay.example.com/'],
        ['t', 'bug']
      ]
    };

    const parsed = parseRepoAnnouncementEvent(malformed as RepoAnnouncementEvent);
    // repoId falls back to "" when 'd' has no [1]
    expect(parsed.repoId).toBe('');
    expect(parsed.clone).toEqual([]);
    expect(parsed.relays!.every((r) => !r.endsWith('/'))).toBe(true);
    expect(parsed.hashtags).toEqual(['bug']);
  });
});

describe('NIP-34 patch parsing in src/git/patches.ts (parseGitPatchFromEvent)', () => {
  it('parseGitPatchFromEvent extracts repoId/author and commit headers from a minimal format-patch', () => {
    const patchText = [
      'From 0123456789abcdef0123456789abcdef01234567 Mon Sep 17 00:00:00 2001',
      'From: Test User <test@example.com>',
      'Date: Thu, 1 Jan 1970 00:00:00 +0000',
      'Subject: [PATCH] test change',
      '',
      '---',
      ' file.txt | 1 +',
      ' 1 file changed, 1 insertion(+)',
      ' create mode 100644 file.txt',
      '',
      'diff --git a/file.txt b/file.txt',
      'new file mode 100644',
      'index 0000000..e69de29',
      '--- /dev/null',
      '+++ b/file.txt',
      '@@ -0,0 +1 @@',
      '+hello',
      '--',
      '2.39.0',
      ''
    ].join('\\n');

    const evt: any = {
      id: 'p-evt',
      pubkey: 'author-pk',
      created_at: 1700000900,
      sig: 'sig',
      kind: 1617,
      content: patchText,
      tags: [
        ['a', '30617:owner:repo'],
        ['commit', '0123456789abcdef0123456789abcdef01234567'],
        ['committer', 'Test User', 'test@example.com', '1700000900', '0']
      ]
    } satisfies PatchEvent;

    const parsed = parseGitPatchFromEvent(evt as any);
    expect(parsed.id).toBe('p-evt');
    expect(parsed.repoId).toBe('30617:owner:repo');
    expect(typeof parsed.title).toBe('string');
    expect(parsed.author.pubkey).toBe('author-pk');
    expect(parsed.createdAt).toBe(new Date(1700000900 * 1000).toISOString());

    // Basic sanity: parsed commits header array exists and commitCount aligns
    expect(typeof parsed.commitCount).toBe('number');
    expect(Array.isArray(parsed.commits)).toBe(true);

    // Ensure canonical tag helpers can read tags we set (test-side rule)
    expect(getTagValue(evt as any, 'a')).toBe('30617:owner:repo');
    expect(getTags(evt as any, 'committer').length).toBe(1);
  });
});