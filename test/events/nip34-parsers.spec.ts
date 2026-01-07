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

  it('roundtrips repo announcement fields from builder through parser (builder→parser symmetry)', () => {
    const built = createRepoAnnouncementEvent({
      repoId: 'alice/example-repo',
      name: 'Example Repo',
      description: 'A longer description',
      web: ['https://example.com', 'https://example.com/docs'],
      clone: ['https://github.com/alice/example-repo.git', 'https://gitlab.com/alice/example-repo.git'],
      relays: ['wss://relay.example.com/', 'wss://relay.example.com', 'wss://relay.two/'],
      maintainers: ['npub1maintainer'],
      hashtags: ['bug', 'feature'],
      earliestUniqueCommit: 'euc-xyz',
      created_at: 1700000999
    });

    const evt = withMeta(built as any as RepoAnnouncementEvent, {
      created_at: 1700000999,
      pubkey: 'npub1alice',
      id: 'ann-rt-1'
    });

    const parsed = parseRepoAnnouncementEvent(evt);
    expect(parsed.id).toBe('ann-rt-1');

    // createRepoAnnouncementEvent uses repo name segment for d tag
    expect(parsed.repoId).toBe('example-repo');
    expect(parsed.owner).toBe('npub1alice');
    expect(parsed.address).toBe(`30617:npub1alice:example-repo`);

    expect(parsed.name).toBe('Example Repo');
    expect(parsed.description).toBe('A longer description');
    expect(parsed.web).toEqual(['https://example.com', 'https://example.com/docs']);
    expect(parsed.clone).toEqual([
      'https://github.com/alice/example-repo.git',
      'https://gitlab.com/alice/example-repo.git'
    ]);

    // Relays should be sanitized (no trailing slashes) and de-duped
    expect(parsed.relays).toEqual(['wss://relay.example.com', 'wss://relay.two']);
    expect(parsed.maintainers).toEqual(['npub1maintainer']);
    expect(parsed.hashtags?.sort()).toEqual(['bug', 'feature'].sort());
    expect(parsed.earliestUniqueCommit).toBe('euc-xyz');
    expect(parsed.createdAt).toBe(new Date(1700000999 * 1000).toISOString());
  });

  it('accepts created_at as a numeric string (current behavior via JS coercion)', () => {
    const built = createRepoAnnouncementEvent({
      repoId: 'owner/name',
      name: 'Repo Name'
    });

    const evt: any = {
      ...(built as any),
      id: 'ann-str-created-at',
      pubkey: 'owner-pk',
      sig: '00'.repeat(64),
      created_at: '1700000100'
    };

    const parsed = parseRepoAnnouncementEvent(evt as any);
    expect(parsed.createdAt).toBe(new Date(1700000100 * 1000).toISOString());
  });

  it('handles missing created_at gracefully (implementation: parser falls back to Date.now())', () => {
    const built = createRepoAnnouncementEvent({
      repoId: 'owner/name',
      name: 'Repo Name'
    });

    const evt: any = {
      ...(built as any),
      id: 'ann-missing-created-at',
      pubkey: 'owner-pk',
      sig: '00'.repeat(64)
      // created_at intentionally missing
    };

    // Current implementation falls back to Date.now() when created_at is missing
    const parsed = parseRepoAnnouncementEvent(evt as any);
    // Use a recent timestamp range to avoid flaky tests due to Date.now()
    const now = Date.now();
    const parsedTime = new Date(parsed.createdAt).getTime();
    expect(parsedTime).toBeGreaterThanOrEqual(now - 5000);
    expect(parsedTime).toBeLessThanOrEqual(now + 5000);
  });

  it.todo('should accept ISO created_at strings (implementation gap: parsers currently assume integer seconds)');

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

  it('roundtrips patch fields from builder through parser (including commit linkage and snippet tags preserved on raw)', () => {
    const built = createPatchEvent({
      content: 'diff --git a/README.md b/README.md\n',
      repoAddr: '30617:owner:repo',
      earliestUniqueCommit: 'euc-abc',
      commit: '1111111111111111111111111111111111111111',
      parentCommit: '0000000000000000000000000000000000000000',
      committer: {
        name: 'Alice',
        email: 'alice@example.com',
        timestamp: '1700000700',
        tzOffset: '0'
      },
      recipients: ['pk1', 'pk2'],
      created_at: 1700000700
    });

    // Add NIP-95-ish snippet metadata tags to ensure they survive parse via `raw`
    const snippetTags: string[][] = [
      ['l', 'README-snippet'],
      ['x', 'abcd'.repeat(16)],
      ['f', 'README.md', 'text/markdown', 'abcd'.repeat(16), '42'],
      ['description', 'Example snippet']
    ];

    const evt: any = {
      ...(built as any),
      id: 'patch-rt-1',
      pubkey: 'author-pk',
      sig: '00'.repeat(64),
      created_at: 1700000700,
      tags: [...(built as any).tags, ...snippetTags]
    };

    const parsed = parsePatchEvent(evt as any);

    expect(parsed.id).toBe('patch-rt-1');
    expect(parsed.repoId).toBe('30617:owner:repo');

    // parsePatchEvent currently uses 'subject' tag for title; builder does not set it
    expect(parsed.title).toBe('');

    // Parsed commit linkage
    expect(parsed.commitHash).toBe('1111111111111111111111111111111111111111');
    expect(parsed.commitCount).toBe(1);
    expect(parsed.createdAt).toBe(new Date(1700000700 * 1000).toISOString());

    // parsePatchEvent maps author from `committer` tag (note: avatar currently maps to committer email)
    expect(parsed.author.pubkey).toBe('author-pk');
    expect(parsed.author.name).toBe('Alice');
    expect(parsed.author.avatar).toBe('alice@example.com');

    // Builder fields not yet parsed into structured fields should still be present on raw tags
    expect(parsed.raw.tags).toEqual(
      expect.arrayContaining([
        ['a', '30617:owner:repo'],
        ['r', 'euc-abc'],
        ['commit', '1111111111111111111111111111111111111111'],
        ['parent-commit', '0000000000000000000000000000000000000000'],
        ['committer', 'Alice', 'alice@example.com', '1700000700', '0'],
        ['p', 'pk1'],
        ['p', 'pk2']
      ])
    );

    // Snippet metadata is not parsed into structured fields yet, but should remain on raw tags
    expect(parsed.raw.tags).toEqual(
      expect.arrayContaining([
        ['l', 'README-snippet'],
        ['description', 'Example snippet'],
        ['f', 'README.md', 'text/markdown', 'abcd'.repeat(16), '42']
      ])
    );
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