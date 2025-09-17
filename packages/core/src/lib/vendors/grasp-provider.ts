import type {
  VendorProvider,
  RepoMetadata,
  CreateRepoOptions,
  UpdateRepoOptions,
  GitVendor
} from '../vendor-providers.js';

/**
 * GRASP Vendor Provider
 *
 * Notes:
 * - GRASP Git Smart HTTP is unauthenticated. Authentication is via signed Nostr events.
 * - REST-style operations should be performed via GraspApi (GitServiceApi), not this provider.
 */
export class GraspProvider implements VendorProvider {
  readonly vendor: GitVendor = 'grasp';
  readonly hostname: string;

  // We assume wss:// for relay and https:// for Smart HTTP by default
  constructor(hostname: string) {
    this.hostname = hostname;
  }

  // Minimal metadata; GRASP does not expose standard REST for this via provider
  async getRepoMetadata(owner: string, repo: string, _token?: string): Promise<RepoMetadata> {
    return {
      id: `${owner}/${repo}`,
      name: repo,
      fullName: `${owner}/${repo}`,
      description: undefined,
      defaultBranch: 'main',
      isPrivate: false,
      cloneUrl: this.getCloneUrl(owner, repo),
      htmlUrl: `https://${this.hostname}/${owner}/${repo}`,
      owner: {
        login: owner,
        type: 'User'
      }
    };
  }

  // REST mutations are not supported through VendorProvider; use GraspApi instead
  async createRepo(
    _name: string,
    _options: CreateRepoOptions,
    _token: string
  ): Promise<RepoMetadata> {
    throw new Error(
      'GRASP repository creation is not supported via VendorProvider. Use GraspApi through getGitServiceApi("grasp", pubkey, relayUrl).'
    );
  }

  async updateRepo(
    _owner: string,
    _repo: string,
    _options: UpdateRepoOptions,
    _token: string
  ): Promise<RepoMetadata> {
    throw new Error(
      'GRASP repository update is not supported via VendorProvider. Use GraspApi through getGitServiceApi("grasp", pubkey, relayUrl).'
    );
  }

  async forkRepo(
    _owner: string,
    _repo: string,
    _forkName: string,
    _token: string
  ): Promise<RepoMetadata> {
    throw new Error(
      'GRASP repository forking is not supported via VendorProvider. Use GraspApi through getGitServiceApi("grasp", pubkey, relayUrl).'
    );
  }

  // Smart HTTP clone URL (unauthenticated)
  getCloneUrl(owner: string, repo: string): string {
    // Default to HTTPS Smart HTTP endpoint derived from relay host
    return `https://${this.hostname}/${owner}/${repo}.git`;
  }

  // For completeness; not generally used for GRASP in VendorProvider flows
  getApiUrl(path: string): string {
    // Assume wss relay base for API-like interactions (handled by GraspApi)
    return `wss://${this.hostname}/${path}`;
  }

  // Parse both ws(s):// and http(s):// GRASP URLs
  parseRepoUrl(url: string): { owner: string; repo: string } | null {
    const hostRe = this.hostname.replace('.', '\\.');
    const patterns = [
      // HTTPS Smart HTTP: https://relay.host/owner/repo(.git)
      new RegExp(`https?://${hostRe}/([^/]+)/([^/]+)(?:\\.git)?$`),
      // WS Relay paths: wss://relay.host/owner/repo (optional .git)
      new RegExp(`wss?://${hostRe}/([^/]+)/([^/]+)(?:\\.git)?$`)
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return { owner: match[1], repo: match[2] };
      }
    }
    return null;
  }

  getTokenKey(): string {
    return this.hostname;
  }

  // GRASP uses signed events, not HTTP Authorization headers
  getAuthHeaders(_token: string): Record<string, string> {
    return {};
  }
}
