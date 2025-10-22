// IndexedDB-backed repo cache utilities for the worker
// Keeps core free from large inline classes in git-worker.ts

import type { MergeAnalysisResult } from '../../merge-analysis.js';

export interface RepoCache {
  repoId: string;
  lastUpdated: number;
  headCommit: string;
  dataLevel: 'refs' | 'shallow' | 'full';
  branches: Array<{ name: string; commit: string }>;
  cloneUrls: string[];
  commitCount?: number;
}

export interface CommitHistoryCache {
  id: string; // repoId:branch
  repoId: string;
  branch: string;
  commits: any[];
  totalCount?: number;
  lastUpdated: number;
  depth: number;
  headCommit?: string;
}

export class RepoCacheManager {
  private dbName = 'nostr-git-cache';
  private dbVersion = 2;
  private db: IDBDatabase | null = null;

  private mergeAnalysisKey(repoId: string, patchId: string, targetBranch: string): string {
    return `${repoId}::${patchId}::${targetBranch}`;
  }

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Repos object store
        if (!db.objectStoreNames.contains('repos')) {
          const repoStore = db.createObjectStore('repos', { keyPath: 'repoId' });
          repoStore.createIndex('lastUpdated', 'lastUpdated');
        }
        
        // Commits object store for commit history caching
        if (!db.objectStoreNames.contains('commits')) {
          const commitStore = db.createObjectStore('commits', { keyPath: 'id' });
          commitStore.createIndex('repoId', 'repoId');
          commitStore.createIndex('lastUpdated', 'lastUpdated');
          commitStore.createIndex('repoIdBranch', ['repoId', 'branch']);
        }

        // Merge analysis cache store
        if (!db.objectStoreNames.contains('mergeAnalysis')) {
          const mergeStore = db.createObjectStore('mergeAnalysis', { keyPath: 'id' });
          mergeStore.createIndex('repoId', 'repoId');
          mergeStore.createIndex('patchId', 'patchId');
          mergeStore.createIndex('repoBranch', ['repoId', 'targetBranch']);
          mergeStore.createIndex('repoPatchBranch', ['repoId', 'patchId', 'targetBranch']);
          mergeStore.createIndex('lastUpdated', 'lastUpdated');
        }
      };
    });
  }

  async getRepoCache(repoId: string): Promise<RepoCache | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['repos'], 'readonly');
      const store = transaction.objectStore('repos');
      const request = store.get(repoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async setRepoCache(cache: RepoCache): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['repos'], 'readwrite');
      const store = transaction.objectStore('repos');
      const request = store.put(cache);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getMergeAnalysis(
    repoId: string,
    patchId: string,
    targetBranch: string
  ): Promise<MergeAnalysisResult | null> {
    await this.init();
    if (!this.db) return null;

    const id = this.mergeAnalysisKey(repoId, patchId, targetBranch);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['mergeAnalysis'], 'readonly');
      const store = transaction.objectStore('mergeAnalysis');
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const record = request.result as { result?: MergeAnalysisResult } | undefined;
        resolve(record?.result ?? null);
      };
    });
  }

  async setMergeAnalysis(
    repoId: string,
    patchId: string,
    targetBranch: string,
    result: MergeAnalysisResult
  ): Promise<void> {
    await this.init();
    if (!this.db) return;

    const id = this.mergeAnalysisKey(repoId, patchId, targetBranch);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['mergeAnalysis'], 'readwrite');
      const store = transaction.objectStore('mergeAnalysis');
      const request = store.put({
        id,
        repoId,
        patchId,
        targetBranch,
        result,
        lastUpdated: Date.now()
      });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async deleteMergeAnalysis(repoId: string, patchId: string, targetBranch: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    const id = this.mergeAnalysisKey(repoId, patchId, targetBranch);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['mergeAnalysis'], 'readwrite');
      const store = transaction.objectStore('mergeAnalysis');
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async deleteRepoCache(repoId: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['repos'], 'readwrite');
      const store = transaction.objectStore('repos');
      const request = store.delete(repoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getCommitHistory(repoId: string, branch: string): Promise<CommitHistoryCache | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['commits'], 'readonly');
      const store = transaction.objectStore('commits');
      const key = `${repoId}:${branch}`;
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async setCommitHistory(cache: CommitHistoryCache): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['commits'], 'readwrite');
      const store = transaction.objectStore('commits');
      const request = store.put(cache);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async deleteCommitHistory(repoId: string, branch: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['commits'], 'readwrite');
      const store = transaction.objectStore('commits');
      const key = `${repoId}:${branch}`;
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearOldCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    await this.init();
    if (!this.db) return;

    const cutoffTime = Date.now() - maxAgeMs;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['repos', 'commits', 'mergeAnalysis'], 'readwrite');
      
      // Clear old repos
      const repoStore = transaction.objectStore('repos');
      const repoIndex = repoStore.index('lastUpdated');
      const repoRange = IDBKeyRange.upperBound(cutoffTime);
      const repoRequest = repoIndex.openCursor(repoRange);

      repoRequest.onerror = () => reject(repoRequest.error);
      repoRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Clear old commit history
      const commitStore = transaction.objectStore('commits');
      const commitIndex = commitStore.index('lastUpdated');
      const commitRange = IDBKeyRange.upperBound(cutoffTime);
      const commitRequest = commitIndex.openCursor(commitRange);

      commitRequest.onerror = () => reject(commitRequest.error);
      commitRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Clear old merge analysis entries
      const mergeStore = transaction.objectStore('mergeAnalysis');
      const mergeIndex = mergeStore.index('lastUpdated');
      const mergeRange = IDBKeyRange.upperBound(cutoffTime);
      const mergeRequest = mergeIndex.openCursor(mergeRange);

      mergeRequest.onerror = () => reject(mergeRequest.error);
      mergeRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}
