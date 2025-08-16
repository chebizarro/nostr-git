import * as isogit from 'isomorphic-git';
import { GitFetchResult, GitMergeResult, GitProvider } from './provider.js';

export class IsomorphicGitProvider implements GitProvider {
  fs: any;
  http: any;
  corsProxy: string;

  constructor(options: { fs: any; http: any; corsProxy: string }) {
    this.fs = options.fs;
    this.http = options.http;
    this.corsProxy = options.corsProxy;
  }

  // Return a tree walker for the given ref (commit-ish)
  TREE(options: { ref: string }) {
    // isomorphic-git exposes TREE as a function for tree-walking
    // https://isomorphic-git.org/docs/en/TREE
    return (isogit as any).TREE({ ...options, fs: this.fs });
  }
  // Repository
  async clone(options: any) { return isogit.clone({ ...options, fs: this.fs, http: this.http, corsProxy: this.corsProxy }); }
  async commit(options: any) { return isogit.commit({ ...options, fs: this.fs }); }
  async fetch(options: any) { return isogit.fetch({ ...options, fs: this.fs, http: this.http }) as Promise<GitFetchResult>; }
  async init(options: any) { return isogit.init({ ...options, fs: this.fs }); }
  async log(options: any) { return isogit.log({ ...options, fs: this.fs }); }
  async merge(options: any) { return isogit.merge({ ...options, fs: this.fs }) as Promise<GitMergeResult>; }
  async pull(options: any) { return isogit.pull({ ...options, fs: this.fs, http: this.http }); }
  async push(options: any) { return isogit.push({ ...options, fs: this.fs, http: this.http }); }
  async status(options: any) { return isogit.status({ ...options, fs: this.fs }); }
  async statusMatrix(options: any) { return isogit.statusMatrix({ ...options, fs: this.fs }); }
  async version() { return isogit.version(); }

  // Branches
  async deleteBranch(options: any) { return isogit.deleteBranch({ ...options, fs: this.fs }); }
  async listBranches(options: any) { return isogit.listBranches({ ...options, fs: this.fs }); }
  async renameBranch(options: any) { return isogit.renameBranch({ ...options, fs: this.fs }); }
  async branch(options: any) { return isogit.branch({ ...options, fs: this.fs }); }

  // Tags
  async deleteTag(options: any) { return isogit.deleteTag({ ...options, fs: this.fs }); }
  async listTags(options: any) { return isogit.listTags({ ...options, fs: this.fs }); }
  async tag(options: any) { return isogit.tag({ ...options, fs: this.fs }); }

  // Files
  async add(options: any) { return isogit.add({ ...options, fs: this.fs }); }
  async addNote(options: any) { return isogit.addNote({ ...options, fs: this.fs }); }
  async listFiles(options: any) { return isogit.listFiles({ ...options, fs: this.fs }); }
  async readBlob(options: any) { return isogit.readBlob({ ...options, fs: this.fs }); }
  async readCommit(options: any) { return isogit.readCommit({ ...options, fs: this.fs }); }
  async readNote(options: any) { return isogit.readNote({ ...options, fs: this.fs }); }
  async readObject(options: any) { return isogit.readObject({ ...options, fs: this.fs }); }
  async readTag(options: any) { return isogit.readTag({ ...options, fs: this.fs }); }
  async readTree(options: any) { return isogit.readTree({ ...options, fs: this.fs }); }
  async remove(options: any) { return isogit.remove({ ...options, fs: this.fs }); }
  async removeNote(options: any) { return isogit.removeNote({ ...options, fs: this.fs }); }
  async writeBlob(options: any) { return isogit.writeBlob({ ...options, fs: this.fs }); }
  async writeCommit(options: any) { return isogit.writeCommit({ ...options, fs: this.fs }); }
  async writeObject(options: any) { return isogit.writeObject({ ...options, fs: this.fs }); }
  async writeRef(options: any) { return isogit.writeRef({ ...options, fs: this.fs }); }
  async writeTag(options: any) { return isogit.writeTag({ ...options, fs: this.fs }); }
  async writeTree(options: any) { return isogit.writeTree({ ...options, fs: this.fs }); }

  // Remotes
  async deleteRemote(options: any) { return isogit.deleteRemote({ ...options, fs: this.fs }); }
  async getRemoteInfo(options: any) { return isogit.getRemoteInfo({ ...options, fs: this.fs }); }
  async getRemoteInfo2(options: any) { return isogit.getRemoteInfo2({ ...options, fs: this.fs }); }
  async listRemotes(options: any) { return isogit.listRemotes({ ...options, fs: this.fs }); }
  async listServerRefs(options: any) { return isogit.listServerRefs({ ...options, fs: this.fs }); }
  async addRemote(options: any) { return isogit.addRemote({ ...options, fs: this.fs }); }

  // Working Directory
  async checkout(options: any) { return isogit.checkout({ ...options, fs: this.fs }); }

  // Config
  async getConfig(options: any) { return isogit.getConfig({ ...options, fs: this.fs }); }
  async getConfigAll(options: any) { return isogit.getConfigAll({ ...options, fs: this.fs }); }
  async setConfig(options: any) { return isogit.setConfig({ ...options, fs: this.fs }); }

  // Refs
  async deleteRef(options: any) { return isogit.deleteRef({ ...options, fs: this.fs }); }
  async expandOid(options: any) { return isogit.expandOid({ ...options, fs: this.fs }); }
  async expandRef(options: any) { return isogit.expandRef({ ...options, fs: this.fs }); }
  async fastForward(options: any) { return isogit.fastForward({ ...options, fs: this.fs }); }
  async findMergeBase(options: any) { return isogit.findMergeBase({ ...options, fs: this.fs }); }
  async findRoot(options: any) { return isogit.findRoot({ ...options, fs: this.fs }); }
  async hashBlob(options: any) { return isogit.hashBlob({ ...options, fs: this.fs }); }
  async indexPack(options: any) { return isogit.indexPack({ ...options, fs: this.fs }); }
  async isDescendent(options: any) { return isogit.isDescendent({ ...options, fs: this.fs }); }
  async isIgnored(options: any) { return isogit.isIgnored({ ...options, fs: this.fs }); }
  async listNotes(options: any) { return isogit.listNotes({ ...options, fs: this.fs }); }
  async listRefs(options: any) { return isogit.listRefs({ ...options, fs: this.fs }); }
  async packObjects(options: any) { return isogit.packObjects({ ...options, fs: this.fs }); }
  async resetIndex(options: any) { return isogit.resetIndex({ ...options, fs: this.fs }); }
  async resolveRef(options: any) { return isogit.resolveRef({ ...options, fs: this.fs }); }
  async stash(options: any) { return isogit.stash({ ...options, fs: this.fs }); }
  async updateIndex(options: any) { return isogit.updateIndex({ ...options, fs: this.fs }); }
  async walk(options: any) { return isogit.walk({ ...options, fs: this.fs }); }
}
