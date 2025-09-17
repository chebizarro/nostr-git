// Defines the interface for a pluggable Git provider

export interface GitProvider {
  // Return a tree walker for the given ref (commit-ish)
  TREE(options: {ref: string}): any
  // Repository
  clone(options: any): Promise<void>
  commit(options: any): Promise<string>
  fetch(options: any): Promise<GitFetchResult>
  init(options: any): Promise<any>
  log(options: any): Promise<any>
  merge(options: any): Promise<GitMergeResult>
  pull(options: any): Promise<any>
  push(options: any): Promise<any>
  status(options: any): Promise<any>
  statusMatrix(options: any): Promise<any>

  // Branches
  deleteBranch(options: any): Promise<any>
  listBranches(options: any): Promise<any>
  renameBranch(options: any): Promise<any>
  branch(options: any): Promise<any>

  // Tags
  deleteTag(options: any): Promise<any>
  listTags(options: any): Promise<any>
  tag(options: any): Promise<any>

  // Files
  add(options: any): Promise<any>
  addNote(options: any): Promise<any>
  listFiles(options: any): Promise<any>
  readBlob(options: any): Promise<any>
  readCommit(options: any): Promise<any>
  readNote(options: any): Promise<any>
  readObject(options: any): Promise<any>
  readTag(options: any): Promise<any>
  readTree(options: any): Promise<any>
  remove(options: any): Promise<any>
  removeNote(options: any): Promise<any>
  writeBlob(options: any): Promise<any>
  writeCommit(options: any): Promise<any>
  writeObject(options: any): Promise<any>
  writeRef(options: any): Promise<any>
  writeTag(options: any): Promise<any>
  writeTree(options: any): Promise<any>

  // Remotes
  deleteRemote(options: any): Promise<any>
  getRemoteInfo(options: any): Promise<any>
  getRemoteInfo2(options: any): Promise<any>
  listRemotes(options: any): Promise<any>
  listServerRefs(options: any): Promise<any>
  addRemote(options: any): Promise<any>

  // Working Directory
  checkout(options: any): Promise<any>

  // Config
  getConfig(options: any): Promise<any>
  getConfigAll(options: any): Promise<any>
  setConfig(options: any): Promise<any>

  // Refs
  deleteRef(options: any): Promise<any>
  expandOid(options: any): Promise<any>
  expandRef(options: any): Promise<any>
  fastForward(options: any): Promise<any>
  findMergeBase(options: any): Promise<any>
  findRoot(options: any): Promise<any>
  hashBlob(options: any): Promise<any>
  indexPack(options: any): Promise<any>
  isDescendent(options: any): Promise<any>
  isIgnored(options: any): Promise<any>
  listNotes(options: any): Promise<any>
  listRefs(options: any): Promise<any>
  packObjects(options: any): Promise<any>
  readNote(options: any): Promise<any>
  removeNote(options: any): Promise<any>
  resetIndex(options: any): Promise<any>
  resolveRef(options: any): Promise<any>
  stash(options: any): Promise<any>
  updateIndex(options: any): Promise<any>
  version(): Promise<any>
  walk(options: any): Promise<any>
}

export type GitMergeResult = {
  oid?: string // The SHA-1 object id that is now at the head of the branch. Absent only if `dryRun` was specified and `mergeCommit` is true.
  alreadyMerged?: boolean // True if the branch was already merged so no changes were made
  fastForward?: boolean // True if it was a fast-forward merge
  mergeCommit?: boolean // True if merge resulted in a merge commit
  tree?: string // The SHA-1 object id of the tree resulting from a merge commit
}

export type GitFetchResult = {
  defaultBranch: string | null // The branch that is cloned if no branch is specified
  fetchHead: string | null // The SHA-1 object id of the fetched head commit
  fetchHeadDescription: string | null // a textual description of the branch that was fetched
  headers?: Map<string, string> // The HTTP response headers returned by the git server
  pruned?: Array<string> // A list of branches that were pruned, if you provided the `prune` parameter
}
