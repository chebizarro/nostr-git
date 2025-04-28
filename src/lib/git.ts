import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { Buffer } from 'buffer';
import { fileTypeFromBuffer } from 'file-type';
import { lookup as mimeLookup } from 'mime-types';
import { createPatch } from 'diff';
import type { PermalinkData } from './permalink.js';

const fs = new LightningFS('nostr-git');
const rootDir = '/repos';

export async function fetchPermalink(data: PermalinkData) {
  const dir = `${rootDir}/${data.owner}/${data.repo}`;
  try {
    await ensureRepo(data);
    const commitOid = await git.resolveRef({ fs, dir, ref: data.branch });
    const { blob } = await git.readBlob({ fs, dir, oid: commitOid, filepath: data.filePath });
    let content = Buffer.from(blob).toString('utf8');

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

async function isRepoCloned(dir: string): Promise<boolean> {
  try {
    await git.resolveRef({ fs, dir, ref: 'HEAD' });
    return true;
  } catch {
    return false;
  }
}

async function ensureRepo(data: PermalinkData, depth: number = 1) {
  const dir = `${rootDir}/${data.owner}/${data.repo}`;
  await isRepoCloned(dir);
    await git.clone({
      fs,
      http,
      dir,
      corsProxy: 'https://cors.isomorphic-git.org',
      url: `https://${data.host}/${data.owner}/${data.repo}.git`,
      ref: data.branch,
      singleBranch: true,
      depth,
      noCheckout: true,
    });
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
  const dir = `${rootDir}/${data.owner}/${data.repo}`;
  try {
    await ensureRepo(data);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : err}`;
  }

  const newOid = data.branch;
  if (!newOid) throw new Error('No commit SHA found in permalink data');
  const { commit } = await git.readCommit({ fs, dir, oid: newOid });
  const parentOid = commit.parent[0];

  const changes = await getFileChanges(dir, parentOid || '', newOid);

  if (data.diffFileHash && changes.length) {
    const match = findDiffMatch(changes, data.diffFileHash);
    if (match) {
      return await createFilePatch(dir, parentOid || '', newOid, match.filepath, match.type);
    }
  }

  if (!parentOid) {
    return await generateMultiFilePatch(dir, '4b825dc642cb6eb9a060e54bf8d69288fbee4904', newOid);
  }

  return await generateMultiFilePatch(dir, parentOid, newOid, changes);
}

function findDiffMatch(
  changes: { filepath: string; type: 'add' | 'remove' | 'modify' }[],
  diffFileHash: string
) {
  return changes.find(async c => await githubPermalinkDiffId(c.filepath) === diffFileHash) || null;
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
async function getFileChanges(dir: string, oldOid: string, newOid: string) {
  const results = await git.walk({
    fs,
    dir,
    trees: [git.TREE({ ref: oldOid }), git.TREE({ ref: newOid })],
    map: async (filepath, [A, B]) => {
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
    }
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
  let oldContent = '', newContent = '';
  try {
    if (changeType !== 'add') {
      const { blob } = await git.readBlob({ fs, dir, oid: oldOid, filepath });
      oldContent = Buffer.from(blob).toString('utf8');
    }
    if (changeType !== 'remove') {
      const { blob } = await git.readBlob({ fs, dir, oid: newOid, filepath });
      newContent = Buffer.from(blob).toString('utf8');
    }
  } catch (err) {
    console.log(`Error reading ${filepath}: ${err}`);
  }

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
