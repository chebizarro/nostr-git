import axios from 'axios';
import type {
  VendorProvider,
  RepoMetadata,
  CreateRepoOptions,
  UpdateRepoOptions,
  GitVendor
} from '../vendor-providers.js';

export class GitHubProvider implements VendorProvider {
  readonly vendor: GitVendor = 'github';
  readonly hostname: string;

  constructor(hostname: string = 'github.com') {
    this.hostname = hostname;
  }

  async getRepoMetadata(owner: string, repo: string, token?: string): Promise<RepoMetadata> {
    const headers = token ? this.getAuthHeaders(token) : {};

    const response = await axios.get(this.getApiUrl(`repos/${owner}/${repo}`), { headers });

    const data = response.data;
    return {
      id: data.id.toString(),
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      defaultBranch: data.default_branch,
      isPrivate: data.private,
      cloneUrl: data.clone_url,
      htmlUrl: data.html_url,
      owner: {
        login: data.owner.login,
        type: data.owner.type
      }
    };
  }

  async createRepo(name: string, options: CreateRepoOptions, token: string): Promise<RepoMetadata> {
    const response = await axios.post(
      this.getApiUrl('user/repos'),
      {
        name,
        description: options.description,
        private: options.isPrivate || false,
        has_issues: options.hasIssues !== false,
        has_wiki: options.hasWiki !== false,
        auto_init: options.autoInit || false,
        license_template: options.licenseTemplate,
        gitignore_template: options.gitignoreTemplate
      },
      {
        headers: {
          ...this.getAuthHeaders(token),
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    const data = response.data;
    return {
      id: data.id.toString(),
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      defaultBranch: data.default_branch,
      isPrivate: data.private,
      cloneUrl: data.clone_url,
      htmlUrl: data.html_url,
      owner: {
        login: data.owner.login,
        type: data.owner.type
      }
    };
  }

  async updateRepo(
    owner: string,
    repo: string,
    options: UpdateRepoOptions,
    token: string
  ): Promise<RepoMetadata> {
    const response = await axios.patch(
      this.getApiUrl(`repos/${owner}/${repo}`),
      {
        name: options.name,
        description: options.description,
        homepage: options.homepage,
        private: options.isPrivate,
        has_issues: options.hasIssues,
        has_wiki: options.hasWiki,
        default_branch: options.defaultBranch
      },
      {
        headers: {
          ...this.getAuthHeaders(token),
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    const data = response.data;
    return {
      id: data.id.toString(),
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      defaultBranch: data.default_branch,
      isPrivate: data.private,
      cloneUrl: data.clone_url,
      htmlUrl: data.html_url,
      owner: {
        login: data.owner.login,
        type: data.owner.type
      }
    };
  }

  /**
   * Check if a fork of the repository already exists for the authenticated user
   * @returns Fork metadata if exists, null otherwise
   */
  async checkExistingFork(
    owner: string,
    repo: string,
    token: string
  ): Promise<RepoMetadata | null> {
    try {
      // Get the list of forks for this repository
      const response = await axios.get(this.getApiUrl(`repos/${owner}/${repo}/forks`), {
        headers: {
          ...this.getAuthHeaders(token),
          Accept: 'application/vnd.github.v3+json'
        },
        params: {
          per_page: 100 // Get up to 100 forks
        }
      });

      // Get current user to check if they own any of the forks
      const userResponse = await axios.get(this.getApiUrl('user'), {
        headers: {
          ...this.getAuthHeaders(token),
          Accept: 'application/vnd.github.v3+json'
        }
      });

      const currentUsername = userResponse.data.login;
      const forks = response.data;

      // Find a fork owned by the current user
      const userFork = forks.find((fork: any) => fork.owner.login === currentUsername);

      if (userFork) {
        return {
          id: userFork.id.toString(),
          name: userFork.name,
          fullName: userFork.full_name,
          description: userFork.description,
          defaultBranch: userFork.default_branch,
          isPrivate: userFork.private,
          cloneUrl: userFork.clone_url,
          htmlUrl: userFork.html_url,
          owner: {
            login: userFork.owner.login,
            type: userFork.owner.type
          }
        };
      }

      return null;
    } catch (error) {
      // If we can't check, return null (assume no fork exists)
      console.error('Error checking for existing fork:', error);
      return null;
    }
  }

  async forkRepo(
    owner: string,
    repo: string,
    forkName: string,
    token: string
  ): Promise<RepoMetadata> {
    // Check if user is trying to fork their own repository
    const userResponse = await axios.get(this.getApiUrl('user'), {
      headers: {
        ...this.getAuthHeaders(token),
        Accept: 'application/vnd.github.v3+json'
      }
    });
    const currentUsername = userResponse.data.login;

    if (owner.toLowerCase() === currentUsername.toLowerCase()) {
      throw new Error(
        `FORK_OWN_REPO: You cannot fork your own repository. Consider creating a new branch or cloning to a new repository instead.`
      );
    }

    // Check if fork already exists
    const existingFork = await this.checkExistingFork(owner, repo, token);
    if (existingFork) {
      throw new Error(
        `FORK_EXISTS: You already have a fork of this repository named "${existingFork.name}". GitHub does not allow multiple forks of the same repository. URL: ${existingFork.htmlUrl}`
      );
    }

    // Step 1: Create the fork
    const forkResponse = await axios.post(
      this.getApiUrl(`repos/${owner}/${repo}/forks`),
      {
        name: forkName,
        private: false // GitHub API defaults to public for forks
      },
      {
        headers: {
          ...this.getAuthHeaders(token),
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    // GitHub returns 201 for new forks, 202 for existing forks
    if (![201, 202].includes(forkResponse.status)) {
      const errorMessage = forkResponse.data?.message || 'Unknown error';
      throw new Error(`Failed to create fork: ${errorMessage}`);
    }

    const forkData = forkResponse.data;
    const forkOwner = forkData.owner.login;

    // Check if GitHub ignored our custom fork name (happens when fork already exists)
    if (forkData.name !== forkName) {
      const existingForkUrl = forkData.html_url;
      throw new Error(
        `FORK_NAME_MISMATCH: Fork already exists with name "${forkData.name}". GitHub does not support renaming existing forks. URL: ${existingForkUrl}`
      );
    }

    // Step 2: Poll until fork is ready (GitHub needs time to create the fork)
    const maxPollAttempts = 30;
    let pollAttempts = 0;

    while (pollAttempts < maxPollAttempts) {
      try {
        const checkResponse = await axios.get(this.getApiUrl(`repos/${forkOwner}/${forkName}`), {
          headers: {
            ...this.getAuthHeaders(token),
            Accept: 'application/vnd.github.v3+json'
          }
        });

        if (checkResponse.status === 200) {
          const data = checkResponse.data;
          return {
            id: data.id.toString(),
            name: data.name,
            fullName: data.full_name,
            description: data.description,
            defaultBranch: data.default_branch,
            isPrivate: data.private,
            cloneUrl: data.clone_url,
            htmlUrl: data.html_url,
            owner: {
              login: data.owner.login,
              type: data.owner.type
            }
          };
        }
      } catch (error) {
        // Fork might not be ready yet, continue polling
      }

      pollAttempts++;
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
    }

    throw new Error('Fork creation timed out. The fork may still be processing.');
  }

  getCloneUrl(owner: string, repo: string): string {
    return `https://${this.hostname}/${owner}/${repo}.git`;
  }

  getApiUrl(path: string): string {
    const baseUrl =
      this.hostname === 'github.com' ? 'https://api.github.com' : `https://${this.hostname}/api/v3`;
    return `${baseUrl}/${path}`;
  }

  parseRepoUrl(url: string): { owner: string; repo: string } | null {
    // Handle various GitHub URL formats
    const patterns = [
      // HTTPS: https://github.com/owner/repo.git
      /https:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\.git)?/,
      // SSH: git@github.com:owner/repo.git
      /git@github\.com:([^\/]+)\/([^\/]+)(?:\.git)?/,
      // Custom hostname patterns
      new RegExp(`https://${this.hostname.replace('.', '\\.')}/([^/]+)/([^/]+)(?:\\.git)?`),
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
    return this.hostname === 'github.com' ? 'github' : this.hostname;
  }

  getAuthHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`
    };
  }
}
