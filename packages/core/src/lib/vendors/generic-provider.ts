import type {
  VendorProvider,
  RepoMetadata,
  CreateRepoOptions,
  UpdateRepoOptions,
  GitVendor
} from '../vendor-providers.js';

export class GenericProvider implements VendorProvider {
  readonly vendor: GitVendor = 'generic';
  readonly hostname: string;

  constructor(hostname: string) {
    this.hostname = hostname;
  }

  async getRepoMetadata(owner: string, repo: string, token?: string): Promise<RepoMetadata> {
    // Generic provider doesn't support API operations
    // Return minimal metadata based on URL parsing
    return {
      id: `${owner}/${repo}`,
      name: repo,
      fullName: `${owner}/${repo}`,
      description: undefined,
      defaultBranch: 'main', // Assume main as default
      isPrivate: false, // Cannot determine without API
      cloneUrl: this.getCloneUrl(owner, repo),
      htmlUrl: `https://${this.hostname}/${owner}/${repo}`,
      owner: {
        login: owner,
        type: 'User' // Cannot determine without API
      }
    };
  }

  async createRepo(name: string, options: CreateRepoOptions, token: string): Promise<RepoMetadata> {
    throw new Error(`Repository creation not supported for generic Git provider: ${this.hostname}`);
  }

  async updateRepo(
    owner: string,
    repo: string,
    options: UpdateRepoOptions,
    token: string
  ): Promise<RepoMetadata> {
    throw new Error(`Repository updates not supported for generic Git provider: ${this.hostname}`);
  }

  async forkRepo(
    owner: string,
    repo: string,
    forkName: string,
    token: string
  ): Promise<RepoMetadata> {
    throw new Error(`Repository forking not supported for generic Git provider: ${this.hostname}`);
  }

  getCloneUrl(owner: string, repo: string): string {
    return `https://${this.hostname}/${owner}/${repo}.git`;
  }

  getApiUrl(path: string): string {
    // Generic provider doesn't have a standard API
    return `https://${this.hostname}/api/${path}`;
  }

  parseRepoUrl(url: string): { owner: string; repo: string } | null {
    // Handle generic Git URL formats
    const patterns = [
      // HTTPS: https://hostname/owner/repo.git
      new RegExp(`https://${this.hostname.replace('.', '\\.')}/([^/]+)/([^/]+)(?:\\.git)?`),
      // SSH: git@hostname:owner/repo.git
      new RegExp(`git@${this.hostname.replace('.', '\\.')}:([^/]+)/([^/]+)(?:\\.git)?`)
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2]
        };
      }
    }

    return null;
  }

  getTokenKey(): string {
    return this.hostname;
  }

  getAuthHeaders(token: string): Record<string, string> {
    // Use generic Authorization header for unknown providers
    return {
      Authorization: `Bearer ${token}`
    };
  }
}
