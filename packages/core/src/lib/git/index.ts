export * from '../files.js';
export * from '../git.js';
export * from '../branches.js';
export * from '../commits.js';
export * from '../remotes.js';
export * from '../status.js';
export * from '../nip34.js';
export * from '../repo.js';

import * as files from '../files.js';
import * as core from '../git.js';
import * as branches from '../branches.js';
import * as commits from '../commits.js';
import * as remotes from '../remotes.js';
import * as status from '../status.js';
import * as nip34 from '../nip34.js';
import * as repo from '../repo.js';

export const git = {
  files,
  core,
  branches,
  commits,
  remotes,
  status,
  nip34,
  repo,
};
