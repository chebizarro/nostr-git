import { GitProvider } from './provider.js';

/**
 * Placeholder for a wasm-git implementation of the GitProvider interface.
 * TODO: Replace all methods with actual wasm-git calls when available.
 */
export class WasmGitProvider implements GitProvider {
  // Repository
  TREE(options: { ref: string }) {
    throw new Error('Not implemented: TREE (wasm-git)');
  }
  async clone(options: any): Promise<any> { throw new Error('Not implemented: clone (wasm-git)'); }
  async commit(options: any): Promise<any> { throw new Error('Not implemented: commit (wasm-git)'); }
  async fetch(options: any): Promise<any> { throw new Error('Not implemented: fetch (wasm-git)'); }
  async init(options: any): Promise<any> { throw new Error('Not implemented: init (wasm-git)'); }
  async log(options: any): Promise<any> { throw new Error('Not implemented: log (wasm-git)'); }
  async merge(options: any): Promise<any> { throw new Error('Not implemented: merge (wasm-git)'); }
  async pull(options: any): Promise<any> { throw new Error('Not implemented: pull (wasm-git)'); }
  async push(options: any): Promise<any> { throw new Error('Not implemented: push (wasm-git)'); }
  async status(options: any): Promise<any> { throw new Error('Not implemented: status (wasm-git)'); }
  async statusMatrix(options: any): Promise<any> { throw new Error('Not implemented: statusMatrix (wasm-git)'); }

  // Branches
  async deleteBranch(options: any): Promise<any> { throw new Error('Not implemented: deleteBranch (wasm-git)'); }
  async listBranches(options: any): Promise<any> { throw new Error('Not implemented: listBranches (wasm-git)'); }
  async renameBranch(options: any): Promise<any> { throw new Error('Not implemented: renameBranch (wasm-git)'); }

  // Tags
  async deleteTag(options: any): Promise<any> { throw new Error('Not implemented: deleteTag (wasm-git)'); }
  async listTags(options: any): Promise<any> { throw new Error('Not implemented: listTags (wasm-git)'); }
  async tag(options: any): Promise<any> { throw new Error('Not implemented: tag (wasm-git)'); }

  // Files
  async add(options: any): Promise<any> { throw new Error('Not implemented: add (wasm-git)'); }
  async addNote(options: any): Promise<any> { throw new Error('Not implemented: addNote (wasm-git)'); }
  async listFiles(options: any): Promise<any> { throw new Error('Not implemented: listFiles (wasm-git)'); }
  async readBlob(options: any): Promise<any> { throw new Error('Not implemented: readBlob (wasm-git)'); }
  async readCommit(options: any): Promise<any> { throw new Error('Not implemented: readCommit (wasm-git)'); }
  async readNote(options: any): Promise<any> { throw new Error('Not implemented: readNote (wasm-git)'); }
  async readObject(options: any): Promise<any> { throw new Error('Not implemented: readObject (wasm-git)'); }
  async readTag(options: any): Promise<any> { throw new Error('Not implemented: readTag (wasm-git)'); }
  async readTree(options: any): Promise<any> { throw new Error('Not implemented: readTree (wasm-git)'); }
  async remove(options: any): Promise<any> { throw new Error('Not implemented: remove (wasm-git)'); }
  async removeNote(options: any): Promise<any> { throw new Error('Not implemented: removeNote (wasm-git)'); }
  async writeBlob(options: any): Promise<any> { throw new Error('Not implemented: writeBlob (wasm-git)'); }
  async writeCommit(options: any): Promise<any> { throw new Error('Not implemented: writeCommit (wasm-git)'); }
  async writeObject(options: any): Promise<any> { throw new Error('Not implemented: writeObject (wasm-git)'); }
  async writeRef(options: any): Promise<any> { throw new Error('Not implemented: writeRef (wasm-git)'); }
  async writeTag(options: any): Promise<any> { throw new Error('Not implemented: writeTag (wasm-git)'); }
  async writeTree(options: any): Promise<any> { throw new Error('Not implemented: writeTree (wasm-git)'); }

  // Remotes
  async deleteRemote(options: any): Promise<any> { throw new Error('Not implemented: deleteRemote (wasm-git)'); }
  async getRemoteInfo(options: any): Promise<any> { throw new Error('Not implemented: getRemoteInfo (wasm-git)'); }
  async getRemoteInfo2(options: any): Promise<any> { throw new Error('Not implemented: getRemoteInfo2 (wasm-git)'); }
  async listRemotes(options: any): Promise<any> { throw new Error('Not implemented: listRemotes (wasm-git)'); }
  async listServerRefs(options: any): Promise<any> { throw new Error('Not implemented: listServerRefs (wasm-git)'); }

  // Config
  async getConfig(options: any): Promise<any> { throw new Error('Not implemented: getConfig (wasm-git)'); }
  async getConfigAll(options: any): Promise<any> { throw new Error('Not implemented: getConfigAll (wasm-git)'); }
  async setConfig(options: any): Promise<any> { throw new Error('Not implemented: setConfig (wasm-git)'); }

  // Refs
  async deleteRef(options: any): Promise<any> { throw new Error('Not implemented: deleteRef (wasm-git)'); }
  async expandOid(options: any): Promise<any> { throw new Error('Not implemented: expandOid (wasm-git)'); }
  async expandRef(options: any): Promise<any> { throw new Error('Not implemented: expandRef (wasm-git)'); }
  async fastForward(options: any): Promise<any> { throw new Error('Not implemented: fastForward (wasm-git)'); }
  async findMergeBase(options: any): Promise<any> { throw new Error('Not implemented: findMergeBase (wasm-git)'); }
  async findRoot(options: any): Promise<any> { throw new Error('Not implemented: findRoot (wasm-git)'); }
  async hashBlob(options: any): Promise<any> { throw new Error('Not implemented: hashBlob (wasm-git)'); }
  async indexPack(options: any): Promise<any> { throw new Error('Not implemented: indexPack (wasm-git)'); }
  async isDescendent(options: any): Promise<any> { throw new Error('Not implemented: isDescendent (wasm-git)'); }
  async isIgnored(options: any): Promise<any> { throw new Error('Not implemented: isIgnored (wasm-git)'); }
  async listNotes(options: any): Promise<any> { throw new Error('Not implemented: listNotes (wasm-git)'); }
  async listRefs(options: any): Promise<any> { throw new Error('Not implemented: listRefs (wasm-git)'); }
  async packObjects(options: any): Promise<any> { throw new Error('Not implemented: packObjects (wasm-git)'); }
  async resetIndex(options: any): Promise<any> { throw new Error('Not implemented: resetIndex (wasm-git)'); }
  async resolveRef(options: any): Promise<any> { throw new Error('Not implemented: resolveRef (wasm-git)'); }
  async stash(options: any): Promise<any> { throw new Error('Not implemented: stash (wasm-git)'); }
  async updateIndex(options: any): Promise<any> { throw new Error('Not implemented: updateIndex (wasm-git)'); }
  async version(): Promise<any> { throw new Error('Not implemented: version (wasm-git)'); }
  async walk(options: any): Promise<any> { throw new Error('Not implemented: walk (wasm-git)'); }
}
