export * from '../files.js';
export * from '../git.js';
export * from '../branches.js';
export * from '../commits.js';
export * from '../remotes.js';
export * from '../status.js';
export * from '../nip34.js';
export * from '../repo.js';
export * from '../patches.js';

// New unified Git Service API abstraction layer
export {
  type GitServiceApi,
  type RepoMetadata,
  type User,
  type GitForkOptions,
  type NewIssue,
  type NewPullRequest,
  type ListCommitsOptions,
  type ListIssuesOptions,
  type ListPullRequestsOptions,
  // Explicitly re-export with different names to avoid conflicts
  type Commit as GitCommit,
  type Issue as GitIssue,
  type PullRequest as GitPullRequest,
  type Patch as GitPatch
} from './api.js';
export {
  getGitServiceApi,
  getGitServiceApiFromUrl,
  getAvailableProviders,
  supportsRestApi,
  getDefaultApiBaseUrl
} from './factory.js';
export { GitHubApi } from './providers/github.js';
export { GitLabApi } from './providers/gitlab.js';
export { GiteaApi } from './providers/gitea.js';
export { BitbucketApi } from './providers/bitbucket.js';
export { NostrGitProvider } from './providers/nostr-git-provider.js';
export { GraspApi } from './providers/grasp-api.js';
export {
  createNostrGitProvider,
  createNostrGitProviderFromEnv,
  createNostrGitProviderFromGitConfig,
  selectProvider,
  createProviderForUrl,
  DEFAULT_RELAYS
} from './providers/nostr-git-factory.js';

import * as files from '../files.js';
import * as core from '../git.js';
import * as branches from '../branches.js';
import * as commits from '../commits.js';
import * as remotes from '../remotes.js';
import * as status from '../status.js';
import * as nip34 from '../nip34.js';
import * as repo from '../repo.js';
import * as patches from '../patches.js';

// New unified Git Service API abstraction layer
import * as api from './api.js';
import * as factory from './factory.js';
import { GitHubApi } from './providers/github.js';
import { GitLabApi } from './providers/gitlab.js';
import { GiteaApi } from './providers/gitea.js';
import { BitbucketApi } from './providers/bitbucket.js';
import { NostrGitProvider } from './providers/nostr-git-provider.js';
import { GraspApi } from './providers/grasp-api.js';
import {
  createNostrGitProvider,
  createNostrGitProviderFromEnv,
  createNostrGitProviderFromGitConfig,
  selectProvider,
  createProviderForUrl,
  DEFAULT_RELAYS
} from './providers/nostr-git-factory.js';
import { detectVendorFromUrl } from '../vendor-providers.js';

export const git = {
  files,
  core,
  branches,
  commits,
  remotes,
  status,
  nip34,
  repo,
  patches,
  // New unified Git Service API abstraction layer
  api,
  factory,
  providers: {
    GitHubApi,
    GitLabApi,
    GiteaApi,
    BitbucketApi,
    NostrGitProvider,
    GraspApi,
    createNostrGitProvider,
    createNostrGitProviderFromEnv,
    createNostrGitProviderFromGitConfig,
    selectProvider,
    createProviderForUrl,
    DEFAULT_RELAYS
  },
  detectVendorFromUrl
};
