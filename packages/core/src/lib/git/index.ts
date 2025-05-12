// Central entry point for git domain logic in @nostr-git/core

export * from '../files.js';
export * from '../git.js';
export * from '../branches.js';
export * from '../commits.js';
export * from '../remotes.js';
export * from '../status.js';
export * from '../nip34.js';
// As you add more domains (tags, submodules, etc.), add them here:

import * as files from '../files.js';
import * as core from '../git.js';
import * as branches from '../branches.js';
import * as commits from '../commits.js';
import * as remotes from '../remotes.js';
import * as status from '../status.js';
import * as nip34 from '../nip34.js';

export const git = {
  files,
  core,
  branches,
  commits,
  remotes,
  status,
  nip34,
};
