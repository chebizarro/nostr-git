import { getGitProvider } from './git-provider.js';
import { fileTypeFromBuffer } from 'file-type';
import { lookup as mimeLookup } from 'mime-types';
import { createPatch } from 'diff';
import type { RepoAnnouncement } from '@nostr-git/shared-types';
import type { PermalinkData } from './permalink.js';
import { Buffer } from 'buffer';

// Only set Buffer on window if we're in a browser context (not in a worker)
if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
  (window as any).Buffer = Buffer;
}

export const rootDir = '/repos';

export async function fetchPermalink(data: PermalinkData) {
  const dir = `${rootDir}/${data.owner}/${data.repo}`;
  try {
    await ensureRepo({ host: data.host, owner: data.owner, repo: data.repo, branch: data.branch });
    const git = getGitProvider();
    const commitOid = await git.resolveRef({ dir, ref: data.branch });
    const { blob } = await git.readBlob({ dir, oid: commitOid, filepath: data.filePath });
    const decoder = new TextDecoder('utf-8');
    let content = decoder.decode(blob);

    if (data.startLine !== undefined) {
      const lines = content.split('\n');
      const end = data.endLine ?? data.startLine;
      content = lines.slice(data.startLine - 1, end).join('\n');
    }
    return content;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : err}`;
  }
}

export async function isRepoCloned(dir: string): Promise<boolean> {
  const git = getGitProvider();
  try {
    await git.resolveRef({ dir, ref: 'HEAD' });
    return true;
  } catch {
    return false;
  }
}

export async function ensureRepo(opts: { host: string; owner: string; repo: string; branch: string }, depth: number = 1) {
  const git = getGitProvider();
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  if (!(await isRepoCloned(dir))) {
    console.log(`Cloning https://${opts.host}/${opts.owner}/${opts.repo}.git to ${dir} (depth: ${depth})`);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Clone operation timed out after 60 seconds')), 60000);
    });

    const clonePromise = git.clone({
      dir,
      corsProxy: 'https://cors.isomorphic-git.org',
      url: `https://${opts.host}/${opts.owner}/${opts.repo}.git`,
      ref: opts.branch,
      depth: Math.min(depth, 1), // Force shallow clone for large repos
      noCheckout: true,
      noTags: true,
      singleBranch: true,
      // Optimize for speed over completeness
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Only last 30 days
      onProgress: (progress: any) => {
        // Only log major progress milestones to reduce overhead
        if (progress.phase === 'Receiving objects' || progress.phase === 'Resolving deltas') {
          console.log(`${progress.phase}: ${progress.loaded}/${progress.total} (${Math.round(progress.loaded/progress.total*100)}%)`);
        }
      },
    });

    // Race between clone and timeout
    try {
      await Promise.race([clonePromise, timeoutPromise]);
      console.log(`Successfully cloned https://${opts.host}/${opts.owner}/${opts.repo}.git`);
    } catch (error) {
      console.error(`Clone failed for https://${opts.host}/${opts.owner}/${opts.repo}.git:`, error);
      // Clean up partial clone on failure
      try {
        await git.deleteRef({ dir, ref: 'HEAD' });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw error;
    }
  }
}

export async function ensureRepoFromEvent(opts: { repoEvent: RepoAnnouncement; branch: string }, depth: number = 1) {
  const git = getGitProvider();
  const dir = `${rootDir}/${opts.repoEvent.id}`;

  // Prefer HTTPS clone URL
  let cloneUrl = opts.repoEvent.clone?.find((url) => url.startsWith("https://"));

  // If not found, try to convert SSH to HTTPS
  if (!cloneUrl && opts.repoEvent.clone?.length) {
    for (const url of opts.repoEvent.clone) {
      if (url.startsWith("git@")) {
        const httpsUrl = sshToHttps(url);
        if (httpsUrl) {
          cloneUrl = httpsUrl;
          break;
        }
      }
    }
  }

  if (!cloneUrl) {
    throw new Error("No supported clone URL found in repo announcement");
  }

  if (!(await isRepoCloned(dir))) {
    console.log(`Cloning ${cloneUrl} to ${dir} (depth: ${depth})`);
    
    // Create a timeout promise to prevent infinite stalling
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Clone operation timed out after 60 seconds')), 60000);
    });

    const clonePromise = git.clone({
      dir,
      url: cloneUrl,
      ref: opts.branch,
      singleBranch: true,
      depth,
      noCheckout: true,
      noTags: true,
      // Optimize for speed over completeness
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Only last 30 days
      onProgress: (progress: any) => {
        // Only log major progress milestones to reduce overhead
        if (progress.phase === 'Receiving objects' || progress.phase === 'Resolving deltas') {
          console.log(`${progress.phase}: ${progress.loaded}/${progress.total} (${Math.round(progress.loaded/progress.total*100)}%)`);
        }
      },
      onMessage: (message: any) => console.log('Git message:', message),
    });

    // Race between clone and timeout
    try {
      await Promise.race([clonePromise, timeoutPromise]);
      console.log(`Successfully cloned ${cloneUrl}`);
    } catch (error) {
      console.error(`Clone failed for ${cloneUrl}:`, error);
      // Clean up partial clone on failure
      try {
        await git.deleteRef({ dir, ref: 'HEAD' });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw error;
    }
  }
}

function sshToHttps(sshUrl: string): string | null {
  // Match git@host:user/repo(.git)
  const match = sshUrl.match(/^git@([^:]+):(.+?)(\.git)?$/);
  if (match) {
    const [, host, path] = match;
    return `https://${host}/${path}.git`;
  }
  return null;
}

/**
 * Attempts to guess a file's MIME type from its bytes (accurate),
 * then falls back to extension-based detection
 *
 * @param data - The file data as Uint8Array (optional, but recommended).
 * @param extension - The file extension, e.g. "png" or ".png" (optional).
 * @returns e.g. "image/png", "text/markdown", or "application/octet-stream"
 */
export async function determineMimeType(data?: Uint8Array, extension?: string): Promise<string> {
  if (data) {
    const ftResult = await fileTypeFromBuffer(data);
    if (ftResult?.mime) return ftResult.mime;
  }
  if (extension) {
    const extBasedMime = mimeLookup(extension.replace(/^\./, ''));
    if (extBasedMime) return extBasedMime;
  }
  return 'application/octet-stream';
}

/**
 * Produce a Git-style diff (unified patch) for the commit or diff link
 * described in PermalinkData.
 *
 * @param data - PermalinkData from parsePermalink - a parsed GitHub diff URL
 * @returns The entire patch as a string (unified diff) or the error message.
 */
export async function produceGitDiffFromPermalink(data: PermalinkData): Promise<string> {
  const git = getGitProvider();
  const dir = `${rootDir}/${data.owner}/${data.repo}`;
  try {
    await ensureRepo(data);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : err}`;
  }

  const newOid = data.branch;
  if (!newOid) throw new Error('No commit SHA found in permalink data');
  const { commit } = await git.readCommit({ dir, oid: newOid });
  const parentOid = commit.parent[0];

  const changes = await getFileChanges(dir, parentOid || '', newOid);

  if (data.diffFileHash && changes.length) {
    const match = await findDiffMatch(changes, data.diffFileHash);
    if (match) {
      return await createFilePatch(dir, parentOid || '', newOid, match.filepath, match.type);
    }
  }

  if (!parentOid) {
    return await generateMultiFilePatch(dir, '4b825dc642cb6eb9a060e54bf8d69288fbee4904', newOid);
  }

  return await generateMultiFilePatch(dir, parentOid, newOid, changes);
}

async function findDiffMatch(
  changes: { filepath: string; type: 'add' | 'remove' | 'modify' }[],
  diffFileHash: string
) {
  for (const c of changes) {
    if ((await githubPermalinkDiffId(c.filepath)) === diffFileHash) return c;
  }
  return null;
}

async function generateMultiFilePatch(
  dir: string,
  oldOid: string,
  newOid: string,
  changes?: { filepath: string; type: 'add' | 'remove' | 'modify' }[]
) {
  if (!changes) changes = await getFileChanges(dir, oldOid, newOid);
  const patches = [];
  for (const ch of changes!) {
    const patch = await createFilePatch(dir, oldOid, newOid, ch.filepath, ch.type);
    if (patch.trim()) patches.push(patch);
  }
  return patches.join('');
}

/**
 * Return an array describing how files changed between two commits.
 */
async function getFileChanges(
  dir: string,
  oldOid: string,
  newOid: string
): Promise<Array<{ filepath: string; type: 'add' | 'remove' | 'modify'; Aoid?: string; Boid?: string }>> {
  const git = getGitProvider();
  const results = await git.walk({
    dir,
    trees: [git.TREE({ ref: oldOid }), git.TREE({ ref: newOid })],
    map: async (filepath: string, [A, B]: [any, any]) => {
      if (filepath === '.') return;
      const Atype = await A?.type();
      const Btype = await B?.type();
      if (Atype === 'tree' || Btype === 'tree') return;
      const Aoid = await A?.oid();
      const Boid = await B?.oid();
      if (Aoid === Boid) return;
      let type: 'add' | 'remove' | 'modify' = 'modify';
      if (Aoid === undefined) type = 'add';
      if (Boid === undefined) type = 'remove';
      return { filepath, type, Aoid, Boid };
    },
  });
  return results.filter(Boolean);
}

/**
 * Generate a patch for a single file by reading old/new contents
 */
async function createFilePatch(
  dir: string,
  oldOid: string,
  newOid: string,
  filepath: string,
  changeType: 'add' | 'remove' | 'modify'
) {
  const git = getGitProvider();
  const oldContent = oldOid
    ? (await git.readBlob({ dir, oid: oldOid, filepath })).blob
    : '';
  const newContent = newOid
    ? (await git.readBlob({ dir, oid: newOid, filepath })).blob
    : '';

  const oldBuf = oldContent;
  const newBuf = newContent;

  return createPatch(
    filepath,
    oldContent,
    newContent,
    oldOid.slice(0, 7),
    newOid.slice(0, 7)
  );
}

/**
 * GitHub diff anchors for blob permalinks use SHA-256 of the file path
 */
export async function githubPermalinkDiffId(filePath: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(filePath);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hex;
}

/**
 * Attempt to find which file changed in parentOid..newOid matches
 * the “diff-<sha256(path)>” anchor from GitHub blob permalink.
 */
export async function mapDiffHashToFile(
  dir: string,
  oldOid: string,
  newOid: string,
  diffFileHash: string
): Promise<{ filepath: string, type: 'add' | 'remove' | 'modify' } | null> {
  const changes = await getFileChanges(dir, oldOid, newOid);
  if (!changes.length) return null;

  if (changes.length === 1) {
    return changes[0];
  }

  for (const c of changes) {
    const hash = await githubPermalinkDiffId(c.filepath);
    if (hash === diffFileHash) {
      return c;
    }
  }
  return null;
}
