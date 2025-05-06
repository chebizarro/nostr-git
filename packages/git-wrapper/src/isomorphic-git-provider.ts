import * as isogit from 'isomorphic-git';
import { GitProvider } from './provider';

export class IsomorphicGitProvider implements GitProvider {
  // Repository
  async clone(options: any) { return isogit.clone(options); }
  async commit(options: any) { return isogit.commit(options); }
  async fetch(options: any) { return isogit.fetch(options); }
  async init(options: any) { return isogit.init(options); }
  async log(options: any) { return isogit.log(options); }
  async merge(options: any) { return isogit.merge(options); }
  async pull(options: any) { return isogit.pull(options); }
  async push(options: any) { return isogit.push(options); }
  async status(options: any) { return isogit.status(options); }
  async statusMatrix(options: any) { return isogit.statusMatrix(options); }
  async version() { return isogit.version(); }

  // Branches
  async deleteBranch(options: any) { return isogit.deleteBranch(options); }
  async listBranches(options: any) { return isogit.listBranches(options); }
  async renameBranch(options: any) { return isogit.renameBranch(options); }

  // Tags
  async deleteTag(options: any) { return isogit.deleteTag(options); }
  async listTags(options: any) { return isogit.listTags(options); }
  async tag(options: any) { return isogit.tag(options); }

  // Files
  async add(options: any) { return isogit.add(options); }
  async addNote(options: any) { return isogit.addNote(options); }
  async listFiles(options: any) { return isogit.listFiles(options); }
  async readBlob(options: any) { return isogit.readBlob(options); }
  async readCommit(options: any) { return isogit.readCommit(options); }
  async readNote(options: any) { return isogit.readNote(options); }
  async readObject(options: any) { return isogit.readObject(options); }
  async readTag(options: any) { return isogit.readTag(options); }
  async readTree(options: any) { return isogit.readTree(options); }
  async remove(options: any) { return isogit.remove(options); }
  async removeNote(options: any) { return isogit.removeNote(options); }
  async writeBlob(options: any) { return isogit.writeBlob(options); }
  async writeCommit(options: any) { return isogit.writeCommit(options); }
  async writeObject(options: any) { return isogit.writeObject(options); }
  async writeRef(options: any) { return isogit.writeRef(options); }
  async writeTag(options: any) { return isogit.writeTag(options); }
  async writeTree(options: any) { return isogit.writeTree(options); }

  // Remotes
  async deleteRemote(options: any) { return isogit.deleteRemote(options); }
  async getRemoteInfo(options: any) { return isogit.getRemoteInfo(options); }
  async getRemoteInfo2(options: any) { return isogit.getRemoteInfo2(options); }
  async listRemotes(options: any) { return isogit.listRemotes(options); }
  async listServerRefs(options: any) { return isogit.listServerRefs(options); }

  // Config
  async getConfig(options: any) { return isogit.getConfig(options); }
  async getConfigAll(options: any) { return isogit.getConfigAll(options); }
  async setConfig(options: any) { return isogit.setConfig(options); }

  // Refs
  async deleteRef(options: any) { return isogit.deleteRef(options); }
  async expandOid(options: any) { return isogit.expandOid(options); }
  async expandRef(options: any) { return isogit.expandRef(options); }
  async fastForward(options: any) { return isogit.fastForward(options); }
  async findMergeBase(options: any) { return isogit.findMergeBase(options); }
  async findRoot(options: any) { return isogit.findRoot(options); }
  async hashBlob(options: any) { return isogit.hashBlob(options); }
  async indexPack(options: any) { return isogit.indexPack(options); }
  async isDescendent(options: any) { return isogit.isDescendent(options); }
  async isIgnored(options: any) { return isogit.isIgnored(options); }
  async listNotes(options: any) { return isogit.listNotes(options); }
  async listRefs(options: any) { return isogit.listRefs(options); }
  async packObjects(options: any) { return isogit.packObjects(options); }
  async resetIndex(options: any) { return isogit.resetIndex(options); }
  async resolveRef(options: any) { return isogit.resolveRef(options); }
  async stash(options: any) { return isogit.stash(options); }
  async updateIndex(options: any) { return isogit.updateIndex(options); }
  async walk(options: any) { return isogit.walk(options); }
}

