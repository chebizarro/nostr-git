/**
 * Git Service API Factory
 * 
 * Factory function to create the appropriate GitServiceApi implementation
 * based on the Git provider type and authentication token.
 */

import type { GitServiceApi } from './api.js';
import type { GitVendor } from '../vendor-providers.js';
import { GitHubApi } from './providers/github.js';
import { GitLabApi } from './providers/gitlab.js';
import { GiteaApi } from './providers/gitea.js';
import { BitbucketApi } from './providers/bitbucket.js';

/**
 * Create a GitServiceApi instance for the specified provider
 * 
 * @param provider - The Git service provider ('github', 'gitlab', 'gitea', 'bitbucket')
 * @param token - Authentication token for the provider
 * @param baseUrl - Optional custom base URL (for self-hosted instances)
 * @returns GitServiceApi implementation for the provider
 * 
 * @example
 * ```typescript
 * // GitHub.com
 * const githubApi = getGitServiceApi('github', 'ghp_xxxxxxxxxxxx');
 * 
 * // Self-hosted GitLab
 * const gitlabApi = getGitServiceApi('gitlab', 'glpat-xxxxxxxxxxxx', 'https://gitlab.example.com');
 * 
 * // Self-hosted Gitea
 * const giteaApi = getGitServiceApi('gitea', 'xxxxxxxxxxxxxxxx', 'https://gitea.example.com');
 * ```
 */
export function getGitServiceApi(
  provider: GitVendor, 
  token: string, 
  baseUrl?: string
): GitServiceApi {
  switch (provider) {
    case 'github':
      return new GitHubApi(token, baseUrl);
    
    case 'gitlab':
      return new GitLabApi(token, baseUrl);
    
    case 'gitea':
      return new GiteaApi(token, baseUrl);
    
    case 'bitbucket':
      return new BitbucketApi(token, baseUrl);
    
    case 'generic':
      throw new Error('Generic Git provider does not support REST API operations. Use a specific provider (github, gitlab, gitea, bitbucket).');
    
    default:
      throw new Error(`Unknown Git provider: ${provider}. Supported providers: github, gitlab, gitea, bitbucket`);
  }
}

/**
 * Detect Git provider from URL and create appropriate GitServiceApi instance
 * 
 * @param url - Git repository URL or service base URL
 * @param token - Authentication token for the provider
 * @returns GitServiceApi implementation for the detected provider
 * 
 * @example
 * ```typescript
 * // Auto-detect GitHub from repo URL
 * const api = getGitServiceApiFromUrl('https://github.com/owner/repo', 'ghp_xxxxxxxxxxxx');
 * 
 * // Auto-detect self-hosted GitLab
 * const api = getGitServiceApiFromUrl('https://gitlab.example.com/owner/repo', 'glpat-xxxxxxxxxxxx');
 * ```
 */
export function getGitServiceApiFromUrl(url: string, token: string): GitServiceApi {
  const normalizedUrl = url.toLowerCase();
  
  // Detect provider from URL
  let provider: GitVendor;
  let baseUrl: string | undefined;
  
  if (normalizedUrl.includes('github.com')) {
    provider = 'github';
    baseUrl = 'https://api.github.com';
  } else if (normalizedUrl.includes('gitlab.com')) {
    provider = 'gitlab';
    baseUrl = 'https://gitlab.com/api/v4';
  } else if (normalizedUrl.includes('gitlab.')) {
    provider = 'gitlab';
    // Extract base URL for self-hosted GitLab
    const match = url.match(/https?:\/\/([^\/]+)/);
    baseUrl = match ? `${match[0]}/api/v4` : undefined;
  } else if (normalizedUrl.includes('gitea.')) {
    provider = 'gitea';
    // Extract base URL for self-hosted Gitea
    const match = url.match(/https?:\/\/([^\/]+)/);
    baseUrl = match ? `${match[0]}/api/v1` : undefined;
  } else if (normalizedUrl.includes('bitbucket.org') || normalizedUrl.includes('bitbucket.')) {
    provider = 'bitbucket';
    baseUrl = 'https://api.bitbucket.org/2.0';
  } else {
    throw new Error(`Unable to detect Git provider from URL: ${url}. Supported providers: GitHub, GitLab, Gitea, Bitbucket`);
  }
  
  return getGitServiceApi(provider, token, baseUrl);
}

/**
 * Get available Git service providers
 * 
 * @returns Array of supported Git service provider names
 */
export function getAvailableProviders(): GitVendor[] {
  return ['github', 'gitlab', 'gitea', 'bitbucket'];
}

/**
 * Check if a provider supports REST API operations
 * 
 * @param provider - Git service provider name
 * @returns true if the provider supports REST API operations
 */
export function supportsRestApi(provider: GitVendor): boolean {
  return ['github', 'gitlab', 'gitea', 'bitbucket'].includes(provider);
}

/**
 * Get default API base URL for a provider
 * 
 * @param provider - Git service provider name
 * @returns Default API base URL for the provider
 */
export function getDefaultApiBaseUrl(provider: GitVendor): string {
  switch (provider) {
    case 'github':
      return 'https://api.github.com';
    case 'gitlab':
      return 'https://gitlab.com/api/v4';
    case 'gitea':
      throw new Error('Gitea requires a custom base URL for self-hosted instances');
    case 'bitbucket':
      return 'https://api.bitbucket.org/2.0';
    case 'generic':
      throw new Error('Generic provider does not have a default API base URL');
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
