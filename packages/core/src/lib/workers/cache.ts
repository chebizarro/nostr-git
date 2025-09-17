// IndexedDB-backed repo cache utilities for the worker
// Keeps core free from large inline classes in git-worker.ts

export interface RepoCache {
  repoId: string;
  lastUpdated: number;
  headCommit: string;
  dataLevel: 'refs' | 'shallow' | 'full';
  branches: Array<{ name: string; commit: string }>;
  cloneUrls: string[];
  commitCount?: number;
}

export class RepoCacheManager {
  private dbName = 'nostr-git-cache';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

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
        if (!db.objectStoreNames.contains('repos')) {
          const store = db.createObjectStore('repos', { keyPath: 'repoId' });
          store.createIndex('lastUpdated', 'lastUpdated');
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

  async clearOldCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    await this.init();
    if (!this.db) return;

    const cutoffTime = Date.now() - maxAgeMs;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['repos'], 'readwrite');
      const store = transaction.objectStore('repos');
      const index = store.index('lastUpdated');
      const range = IDBKeyRange.upperBound(cutoffTime);
      const request = index.openCursor(range);

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }
}
