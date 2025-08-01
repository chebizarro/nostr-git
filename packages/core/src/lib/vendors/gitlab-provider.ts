import axios from 'axios';
import type { VendorProvider, RepoMetadata, CreateRepoOptions, UpdateRepoOptions, GitVendor } from '../vendor-providers.js';

export class GitLabProvider implements VendorProvider {
  readonly vendor: GitVendor = 'gitlab';
  readonly hostname: string;

  constructor(hostname: string = 'gitlab.com') {
    this.hostname = hostname;
  }

  async getRepoMetadata(owner: string, repo: string, token?: string): Promise<RepoMetadata> {
    const headers = token ? this.getAuthHeaders(token) : {};
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    
    const response = await axios.get(
      this.getApiUrl(`projects/${projectPath}`),
      { headers }
    );

    const data = response.data;
    return {
      id: data.id.toString(),
      name: data.name,
      fullName: data.path_with_namespace,
      description: data.description,
      defaultBranch: data.default_branch,
      isPrivate: data.visibility === 'private',
      cloneUrl: data.http_url_to_repo,
      htmlUrl: data.web_url,
      owner: {
        login: data.namespace.path,
        type: data.namespace.kind === 'user' ? 'User' : 'Organization'
      }
    };
  }

  async createRepo(name: string, options: CreateRepoOptions, token: string): Promise<RepoMetadata> {
    const response = await axios.post(
      this.getApiUrl('projects'),
      {
        name,
        description: options.description,
        visibility: options.isPrivate ? 'private' : 'public',
        issues_enabled: options.hasIssues !== false,
        wiki_enabled: options.hasWiki !== false,
        initialize_with_readme: options.autoInit || false
      },
      {
        headers: this.getAuthHeaders(token)
      }
    );

    const data = response.data;
    return {
      id: data.id.toString(),
      name: data.name,
      fullName: data.path_with_namespace,
      description: data.description,
      defaultBranch: data.default_branch,
      isPrivate: data.visibility === 'private',
      cloneUrl: data.http_url_to_repo,
      htmlUrl: data.web_url,
      owner: {
        login: data.namespace.path,
        type: data.namespace.kind === 'user' ? 'User' : 'Organization'
      }
    };
  }

  async updateRepo(owner: string, repo: string, options: UpdateRepoOptions, token: string): Promise<RepoMetadata> {
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    
    const response = await axios.put(
      this.getApiUrl(`projects/${projectPath}`),
      {
        name: options.name,
        description: options.description,
        visibility: options.isPrivate ? 'private' : 'public',
        issues_enabled: options.hasIssues,
        wiki_enabled: options.hasWiki,
        default_branch: options.defaultBranch
      },
      {
        headers: this.getAuthHeaders(token)
      }
    );

    const data = response.data;
    return {
      id: data.id.toString(),
      name: data.name,
      fullName: data.path_with_namespace,
      description: data.description,
      defaultBranch: data.default_branch,
      isPrivate: data.visibility === 'private',
      cloneUrl: data.http_url_to_repo,
      htmlUrl: data.web_url,
      owner: {
        login: data.namespace.path,
        type: data.namespace.kind === 'user' ? 'User' : 'Organization'
      }
    };
  }

  async forkRepo(owner: string, repo: string, forkName: string, token: string): Promise<RepoMetadata> {
    const projectPath = encodeURIComponent(`${owner}/${repo}`);
    
    const response = await axios.post(
      this.getApiUrl(`projects/${projectPath}/fork`),
      {
        name: forkName,
        path: forkName
      },
      {
        headers: this.getAuthHeaders(token)
      }
    );

    if (response.status !== 201) {
      const errorMessage = response.data?.message || 'Unknown error';
      throw new Error(`Failed to create fork: ${errorMessage}`);
    }

    const data = response.data;
    return {
      id: data.id.toString(),
      name: data.name,
      fullName: data.path_with_namespace,
      description: data.description,
      defaultBranch: data.default_branch,
      isPrivate: data.visibility === 'private',
      cloneUrl: data.http_url_to_repo,
      htmlUrl: data.web_url,
      owner: {
        login: data.namespace.path,
        type: data.namespace.kind === 'user' ? 'User' : 'Organization'
      }
    };
  }

  getCloneUrl(owner: string, repo: string): string {
    return `https://${this.hostname}/${owner}/${repo}.git`;
  }

  getApiUrl(path: string): string {
    return `https://${this.hostname}/api/v4/${path}`;
  }

  parseRepoUrl(url: string): { owner: string; repo: string } | null {
    // Handle various GitLab URL formats
    const patterns = [
      // HTTPS: https://gitlab.com/owner/repo.git
      new RegExp(`https://${this.hostname.replace('.', '\\.')}/([^/]+)/([^/]+)(?:\\.git)?`),
      // SSH: git@gitlab.com:owner/repo.git
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
    return this.hostname === 'gitlab.com' ? 'gitlab' : this.hostname;
  }

  getAuthHeaders(token: string): Record<string, string> {
    return {
      'Private-Token': token
    };
  }
}
