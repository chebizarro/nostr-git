/**
 * Tests for NostrGitProvider
 * 
 * Comprehensive tests for the new NostrGitProvider implementation.
 * Tests GRASP integration, multi-relay coordination, and ngit compatibility.
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { NostrGitProvider, type NostrGitConfig } from '../src/lib/git/providers/nostr-git-provider.js';
import { GraspApi } from '../src/lib/git/providers/grasp-api.js';
import type { EventIO, Signer } from '@nostr-git/shared-types';

// Mock implementations
const mockEventIO: EventIO = {
  publish: vi.fn(),
  query: vi.fn(),
  getRelayInfo: vi.fn()
};

const mockSigner: Signer = {
  signEvent: vi.fn(),
  getPublicKey: vi.fn()
};

const mockGraspApi = {
  publishStateFromLocal: vi.fn()
};

describe('NostrGitProvider', () => {
  let provider: NostrGitProvider;
  let config: NostrGitConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    config = {
      eventIO: mockEventIO,
      signer: mockSigner,
      defaultRelays: ['wss://relay1.example.com', 'wss://relay2.example.com'],
      fallbackRelays: ['wss://fallback1.example.com'],
      graspRelays: ['wss://grasp1.example.com'],
      publishRepoState: true,
      publishRepoAnnouncements: false,
      httpOverrides: {
        corsProxy: 'https://cors.example.com'
      }
    };

    provider = new NostrGitProvider(config);
  });

  describe('Repository Discovery', () => {
    it('should discover repository information', async () => {
      const mockDiscovery = {
        urls: ['https://github.com/user/repo.git'],
        announcement: {
          repoAddr: '30617:user:repo',
          maintainers: ['npub1...'],
          relays: ['wss://relay1.example.com']
        },
        state: {
          repoAddr: '30617:user:repo',
          refs: { 'HEAD': 'ref: refs/heads/main' }
        }
      };

      // Mock the git-wrapper provider's discoverRepo method
      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        discoverRepo: vi.fn().mockResolvedValue(mockDiscovery)
      });

      const result = await provider.discoverRepo('30617:user:repo');

      expect(result).toEqual({
        repoId: '30617:user:repo',
        urls: ['https://github.com/user/repo.git'],
        announcement: mockDiscovery.announcement,
        state: mockDiscovery.state,
        maintainers: ['npub1...'],
        relays: ['wss://relay1.example.com']
      });
    });

    it('should return null when repository not found', async () => {
      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        discoverRepo: vi.fn().mockResolvedValue(null)
      });

      const result = await provider.discoverRepo('30617:nonexistent:repo');
      expect(result).toBeNull();
    });
  });

  describe('Clone Operations', () => {
    it('should clone repository with GRASP support', async () => {
      const mockClone = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        clone: mockClone
      });

      await provider.clone({
        url: 'nostr://npub1.../repo',
        dir: '/tmp/test-repo',
        graspDisableCorsProxy: false,
        publishRepoState: true
      });

      expect(mockClone).toHaveBeenCalledWith({
        url: 'nostr://npub1.../repo',
        dir: '/tmp/test-repo',
        graspDisableCorsProxy: false,
        publishRepoState: true,
        corsProxy: 'https://cors.example.com',
        publishRepoStateFromLocal: true
      });
    });

    it('should disable CORS proxy when requested', async () => {
      const mockClone = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        clone: mockClone
      });

      await provider.clone({
        url: 'nostr://npub1.../repo',
        dir: '/tmp/test-repo',
        graspDisableCorsProxy: true
      });

      expect(mockClone).toHaveBeenCalledWith({
        url: 'nostr://npub1.../repo',
        dir: '/tmp/test-repo',
        graspDisableCorsProxy: true,
        corsProxy: null,
        publishRepoStateFromLocal: true
      });
    });
  });

  describe('Push Operations', () => {
    it('should push with GRASP state publishing', async () => {
      const mockPush = vi.fn().mockResolvedValue(undefined);
      const mockPublishRepoState = vi.fn().mockResolvedValue('state-event-id');
      
      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        push: mockPush
      });
      vi.spyOn(provider, 'publishRepoState').mockImplementation(mockPublishRepoState);

      const result = await provider.push({
        dir: '/tmp/test-repo',
        publishRepoState: true,
        relays: ['wss://relay1.example.com']
      });

      expect(mockPush).toHaveBeenCalledWith({
        dir: '/tmp/test-repo',
        publishRepoState: true,
        relays: ['wss://relay1.example.com'],
        corsProxy: 'https://cors.example.com',
        publishRepoStateFromLocal: true
      });

      expect(mockPublishRepoState).toHaveBeenCalledWith('/tmp/test-repo', ['wss://relay1.example.com']);
      expect(result).toEqual({
        success: true,
        stateEventId: 'state-event-id',
        relays: ['wss://relay1.example.com']
      });
    });

    it('should handle push failures gracefully', async () => {
      const mockPush = vi.fn().mockRejectedValue(new Error('Push failed'));
      
      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        push: mockPush
      });

      const result = await provider.push({
        dir: '/tmp/test-repo'
      });

      expect(result).toEqual({
        success: false,
        relays: ['wss://relay1.example.com', 'wss://relay2.example.com'],
        errors: ['Push failed: Error: Push failed']
      });
    });

    it('should publish repo announcement when enabled', async () => {
      const mockPush = vi.fn().mockResolvedValue(undefined);
      const mockPublishRepoAnnouncement = vi.fn().mockResolvedValue('announcement-event-id');
      
      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        push: mockPush
      });
      vi.spyOn(provider, 'publishRepoAnnouncement').mockImplementation(mockPublishRepoAnnouncement);

      const result = await provider.push({
        dir: '/tmp/test-repo',
        publishRepoAnnouncement: true
      });

      expect(mockPublishRepoAnnouncement).toHaveBeenCalledWith('/tmp/test-repo', undefined);
      expect(result.announcementEventId).toBe('announcement-event-id');
    });
  });

  describe('Repository State Publishing', () => {
    it('should publish repo state to multiple relays', async () => {
      const mockRepoState = {
        repoAddr: '30617:user:repo',
        refs: { 'HEAD': 'ref: refs/heads/main' }
      };

      const mockSignedEvent = {
        id: 'event-id',
        kind: 30618,
        content: '',
        tags: [['a', '30617:user:repo']],
        created_at: 1234567890,
        pubkey: 'npub1...',
        sig: 'sig...'
      };

      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        getRepoState: vi.fn().mockResolvedValue(mockRepoState)
      });

      (mockSigner.signEvent as Mock).mockResolvedValue(mockSignedEvent);
      (mockEventIO.publish as Mock)
        .mockResolvedValueOnce('relay1-event-id')
        .mockResolvedValueOnce('relay2-event-id');

      const result = await provider.publishRepoState('/tmp/test-repo', ['wss://relay1.example.com', 'wss://relay2.example.com']);

      expect(mockSigner.signEvent).toHaveBeenCalled();
      expect(mockEventIO.publish).toHaveBeenCalledTimes(2);
      expect(result).toBe('relay1-event-id');
    });

    it('should handle relay failures gracefully', async () => {
      const mockRepoState = {
        repoAddr: '30617:user:repo',
        refs: { 'HEAD': 'ref: refs/heads/main' }
      };

      const mockSignedEvent = {
        id: 'event-id',
        kind: 30618,
        content: '',
        tags: [['a', '30617:user:repo']],
        created_at: 1234567890,
        pubkey: 'npub1...',
        sig: 'sig...'
      };

      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        getRepoState: vi.fn().mockResolvedValue(mockRepoState)
      });

      (mockSigner.signEvent as Mock).mockResolvedValue(mockSignedEvent);
      (mockEventIO.publish as Mock)
        .mockRejectedValueOnce(new Error('Relay 1 failed'))
        .mockResolvedValueOnce('relay2-event-id');

      const result = await provider.publishRepoState('/tmp/test-repo', ['wss://relay1.example.com', 'wss://relay2.example.com']);

      expect(result).toBe('relay2-event-id');
    });

    it('should throw error when all relays fail', async () => {
      const mockRepoState = {
        repoAddr: '30617:user:repo',
        refs: { 'HEAD': 'ref: refs/heads/main' }
      };

      const mockSignedEvent = {
        id: 'event-id',
        kind: 30618,
        content: '',
        tags: [['a', '30617:user:repo']],
        created_at: 1234567890,
        pubkey: 'npub1...',
        sig: 'sig...'
      };

      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        getRepoState: vi.fn().mockResolvedValue(mockRepoState)
      });

      (mockSigner.signEvent as Mock).mockResolvedValue(mockSignedEvent);
      (mockEventIO.publish as Mock).mockRejectedValue(new Error('All relays failed'));

      await expect(provider.publishRepoState('/tmp/test-repo')).rejects.toThrow('Failed to publish to any relay');
    });
  });

  describe('Proposal Operations', () => {
    it('should list proposals', async () => {
      const mockProposals = [
        { id: 'proposal1', title: 'Test Proposal 1' },
        { id: 'proposal2', title: 'Test Proposal 2' }
      ];

      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        listProposals: vi.fn().mockResolvedValue(mockProposals)
      });

      const result = await provider.listProposals('30617:user:repo', { limit: 10 });

      expect(result).toEqual(mockProposals);
    });

    it('should send proposal', async () => {
      const mockPatchIds = ['patch1', 'patch2'];
      const mockCommits = ['commit1', 'commit2'];

      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        sendProposal: vi.fn().mockResolvedValue(mockPatchIds)
      });

      const result = await provider.sendProposal('30617:user:repo', mockCommits, {
        baseBranch: 'main',
        coverLetter: 'Test proposal',
        publishRepoState: true
      });

      expect(result).toEqual(mockPatchIds);
    });
  });

  describe('Git Utility Operations', () => {
    it('should get ahead/behind information', async () => {
      const mockAheadBehind = {
        ahead: ['commit1', 'commit2'],
        behind: ['commit3']
      };

      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        getAheadBehind: vi.fn().mockResolvedValue(mockAheadBehind)
      });

      const result = await provider.getAheadBehind('/tmp/test-repo', 'main', 'feature');

      expect(result).toEqual(mockAheadBehind);
    });

    it('should check for outstanding changes', async () => {
      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        hasOutstandingChanges: vi.fn().mockResolvedValue(true)
      });

      const result = await provider.hasOutstandingChanges('/tmp/test-repo');

      expect(result).toBe(true);
    });

    it('should get root commit', async () => {
      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        getRootCommit: vi.fn().mockResolvedValue('root-commit-hash')
      });

      const result = await provider.getRootCommit('/tmp/test-repo');

      expect(result).toBe('root-commit-hash');
    });

    it('should get commit info', async () => {
      const mockCommitInfo = {
        hash: 'commit-hash',
        message: 'Test commit',
        author: { name: 'Test Author', email: 'test@example.com' }
      };

      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        getCommitInfo: vi.fn().mockResolvedValue(mockCommitInfo)
      });

      const result = await provider.getCommitInfo('/tmp/test-repo', 'commit-hash');

      expect(result).toEqual(mockCommitInfo);
    });

    it('should get all branches', async () => {
      const mockBranches = [
        { name: 'main', type: 'local' },
        { name: 'feature', type: 'local' },
        { name: 'origin/main', type: 'remote' }
      ];

      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        getAllBranches: vi.fn().mockResolvedValue(mockBranches)
      });

      const result = await provider.getAllBranches('/tmp/test-repo');

      expect(result).toEqual(mockBranches);
    });
  });

  describe('Git Operations Delegation', () => {
    it('should delegate commit operations to git-wrapper', async () => {
      const mockCommit = vi.fn().mockResolvedValue('commit-hash');
      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        commit: mockCommit
      });

      const result = await provider.commit({ message: 'Test commit' });

      expect(mockCommit).toHaveBeenCalledWith({ message: 'Test commit' });
      expect(result).toBe('commit-hash');
    });

    it('should delegate fetch operations to git-wrapper', async () => {
      const mockFetch = vi.fn().mockResolvedValue({});
      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        fetch: mockFetch
      });

      await provider.fetch({ remote: 'origin' });

      expect(mockFetch).toHaveBeenCalledWith({ remote: 'origin' });
    });

    it('should delegate merge operations to git-wrapper', async () => {
      const mockMerge = vi.fn().mockResolvedValue({});
      vi.spyOn(provider as any, 'gitWrapperProvider', 'get').mockReturnValue({
        merge: mockMerge
      });

      await provider.merge({ theirs: 'feature' });

      expect(mockMerge).toHaveBeenCalledWith({ theirs: 'feature' });
    });
  });
});

describe('GraspApi', () => {
  let graspApi: GraspApi;

  beforeEach(() => {
    vi.clearAllMocks();
    
    graspApi = new GraspApi({
      eventIO: mockEventIO,
      signer: mockSigner,
      relays: ['wss://grasp1.example.com', 'wss://grasp2.example.com'],
      timeoutMs: 10000
    });
  });

  describe('State Publishing', () => {
    it('should publish state to GRASP relays', async () => {
      const mockSignedEvent = {
        id: 'state-event-id',
        kind: 30618,
        content: '',
        tags: [['a', '30618:owner:repo']],
        created_at: 1234567890,
        pubkey: 'npub1...',
        sig: 'sig...'
      };

      (mockSigner.signEvent as Mock).mockResolvedValue(mockSignedEvent);
      (mockEventIO.publish as Mock)
        .mockResolvedValueOnce('grasp1-event-id')
        .mockResolvedValueOnce('grasp2-event-id');

      const result = await graspApi.publishStateFromLocal('owner', 'repo');

      expect(mockSigner.signEvent).toHaveBeenCalled();
      expect(mockEventIO.publish).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        eventId: 'state-event-id',
        publishedTo: ['grasp1-event-id', 'grasp2-event-id'],
        relays: ['wss://grasp1.example.com', 'wss://grasp2.example.com']
      });
    });

    it('should handle relay failures in state publishing', async () => {
      const mockSignedEvent = {
        id: 'state-event-id',
        kind: 30618,
        content: '',
        tags: [['a', '30618:owner:repo']],
        created_at: 1234567890,
        pubkey: 'npub1...',
        sig: 'sig...'
      };

      (mockSigner.signEvent as Mock).mockResolvedValue(mockSignedEvent);
      (mockEventIO.publish as Mock)
        .mockRejectedValueOnce(new Error('Grasp1 failed'))
        .mockResolvedValueOnce('grasp2-event-id');

      const result = await graspApi.publishStateFromLocal('owner', 'repo');

      expect(result.publishedTo).toEqual(['grasp2-event-id']);
    });

    it('should throw error when all GRASP relays fail', async () => {
      const mockSignedEvent = {
        id: 'state-event-id',
        kind: 30618,
        content: '',
        tags: [['a', '30618:owner:repo']],
        created_at: 1234567890,
        pubkey: 'npub1...',
        sig: 'sig...'
      };

      (mockSigner.signEvent as Mock).mockResolvedValue(mockSignedEvent);
      (mockEventIO.publish as Mock).mockRejectedValue(new Error('All relays failed'));

      await expect(graspApi.publishStateFromLocal('owner', 'repo')).rejects.toThrow('Failed to publish state to any GRASP relay');
    });
  });

  describe('State Retrieval', () => {
    it('should get state from GRASP relays', async () => {
      const mockStateEvent = {
        id: 'state-event-id',
        kind: 30618,
        content: '',
        tags: [['a', '30618:owner:repo'], ['HEAD', 'ref: refs/heads/main']],
        created_at: 1234567890,
        pubkey: 'npub1...',
        sig: 'sig...'
      };

      (mockEventIO.query as Mock)
        .mockResolvedValueOnce([mockStateEvent])
        .mockResolvedValueOnce([]);

      const result = await graspApi.getStateFromRelays('owner', 'repo');

      expect(mockEventIO.query).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockStateEvent);
    });

    it('should return null when no state found', async () => {
      (mockEventIO.query as Mock).mockResolvedValue([]);

      const result = await graspApi.getStateFromRelays('owner', 'repo');

      expect(result).toBeNull();
    });
  });

  describe('Relay Capabilities', () => {
    it('should check relay capabilities', async () => {
      (mockEventIO.getRelayInfo as Mock).mockResolvedValue({
        supported_nips: [30618, 30617]
      });

      const result = await graspApi.checkRelayCapabilities('wss://grasp.example.com');

      expect(result).toBe(true);
    });

    it('should return false for non-GRASP relays', async () => {
      (mockEventIO.getRelayInfo as Mock).mockResolvedValue({
        supported_nips: [30617]
      });

      const result = await graspApi.checkRelayCapabilities('wss://regular.example.com');

      expect(result).toBe(false);
    });

    it('should return false when relay info unavailable', async () => {
      (mockEventIO.getRelayInfo as Mock).mockResolvedValue(null);

      const result = await graspApi.checkRelayCapabilities('wss://unknown.example.com');

      expect(result).toBe(false);
    });
  });

  describe('Relay Synchronization', () => {
    it('should sync state across capable relays', async () => {
      const mockStateEvent = {
        id: 'state-event-id',
        kind: 30618,
        content: '',
        tags: [['a', '30618:owner:repo']],
        created_at: 1234567890,
        pubkey: 'npub1...',
        sig: 'sig...'
      };

      // Mock capability checks
      vi.spyOn(graspApi, 'checkRelayCapabilities')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      // Mock state retrieval
      vi.spyOn(graspApi, 'getStateFromRelays').mockResolvedValue(mockStateEvent);

      // Mock publishing
      (mockEventIO.publish as Mock)
        .mockResolvedValueOnce('grasp1-event-id')
        .mockResolvedValueOnce('grasp2-event-id');

      const result = await graspApi.syncStateAcrossRelays('owner', 'repo');

      expect(result).toEqual({
        syncedRelays: ['wss://grasp1.example.com', 'wss://grasp2.example.com'],
        failedRelays: [],
        conflicts: []
      });
    });

    it('should handle relay failures in synchronization', async () => {
      const mockStateEvent = {
        id: 'state-event-id',
        kind: 30618,
        content: '',
        tags: [['a', '30618:owner:repo']],
        created_at: 1234567890,
        pubkey: 'npub1...',
        sig: 'sig...'
      };

      // Mock capability checks
      vi.spyOn(graspApi, 'checkRelayCapabilities')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      // Mock state retrieval
      vi.spyOn(graspApi, 'getStateFromRelays').mockResolvedValue(mockStateEvent);

      // Mock publishing with one failure
      (mockEventIO.publish as Mock)
        .mockRejectedValueOnce(new Error('Grasp1 failed'))
        .mockResolvedValueOnce('grasp2-event-id');

      const result = await graspApi.syncStateAcrossRelays('owner', 'repo');

      expect(result.syncedRelays).toEqual(['wss://grasp2.example.com']);
      expect(result.failedRelays).toEqual(['wss://grasp1.example.com']);
      expect(result.conflicts).toHaveLength(1);
    });
  });
});