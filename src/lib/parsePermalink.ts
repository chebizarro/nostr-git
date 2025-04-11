import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { Buffer } from 'buffer';
import { fileTypeFromBuffer } from 'file-type';
import { lookup as mimeLookup } from 'mime-types';
import { createPatch } from 'diff';
import type { PermalinkData } from './permalink.js';

const fs = new LightningFS('my-app-fs');
const rootDir = '/repos';

export async function fetchPermalink(data: PermalinkData) {
  const dir = `${rootDir}/${data.owner}/${data.repo}`;
  try {
    await ensureRepo(data);
    // Resolve the commit OID for our branch
    const commitOid = await git.resolveRef({ fs, dir, ref: data.branch });
    // Read the contents of the partially checked out file
    const { blob } = await git.readBlob({
      fs,
      dir,
      oid: commitOid,
      filepath: data.filePath
    });
    let content = Buffer.from(blob).toString('utf8');

    if (data.startLine !== undefined && data.endLine !== undefined) {
      const lines = content.split('\n');
      const snippet = lines.slice(data.startLine - 1, data.endLine).join('\n');
      content = snippet;
    } else if (data.startLine !== undefined && data.endLine == undefined) {
      const lines = content.split('\n');
      const snippet = lines.slice(data.startLine - 1, data.startLine).join('\n');
      content = snippet;
    }
    return content;
  } catch (err) {
    if (err instanceof Error) {
      return `Error: ${err.message}`;
    } else {
      return `An unknown error ${err} occurred.`;
    }
  }
}

async function isRepoCloned(dir: string): Promise<boolean> {
  try {
    // If HEAD is resolvable, we likely already have a repo at `dir`
    await git.resolveRef({ fs, dir, ref: 'HEAD' });
    // No error => already cloned
    console.log(`repo in: ${dir} has been cloned already`);
    return true;
  } catch {
    // If it throws, there's no valid repo in `dir` => clone
    return false;
  }
}

async function ensureRepo(data: PermalinkData, depth: number = 1) {
  const dir = `${rootDir}/${data.owner}/${data.repo}`;
  const isCloned = await isRepoCloned(dir);
  if (!isCloned || depth > 1) {
    // Shallow clone with no checkout
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
	  noTags: true,
    });
  }
}

/**
 * Attempts to guess a file's MIME type from its bytes (accurate),
 * then falls back to extension-based detection if either:
 * 1) no match was found, or
 * 2) no buffer was provided.
 *
 * @param data - The file data as Uint8Array (optional, but recommended).
 * @param extension - The file extension, e.g. "png" or ".png" (optional).
 * @returns e.g. "image/png", "text/markdown", or "application/octet-stream"
 */
export async function determineMimeType(data?: Uint8Array, extension?: string): Promise<string> {
  if (data) {
    const ftResult = await fileTypeFromBuffer(data);
    if (ftResult && ftResult.mime) {
      return ftResult.mime;
    }
  }

  if (extension) {
    const cleanedExt = extension.replace(/^\./, '');
    const extBasedMime = mimeLookup(cleanedExt);
    if (extBasedMime) {
      return extBasedMime;
    }
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
    await ensureRepo(data, 2);
  } catch (err) {
    if (err instanceof Error) {
      return `Error: ${err.message}`;
    } else {
      return `An unknown error ${err} occurred.`;
    }
  }
  // Treat data.branch as the "new" commit/sha
  const newOid = data.branch;
  if (!newOid) {
    throw new Error('No commit SHA found in permalink data');
  }

  const { commit } = await git.readCommit({ fs, dir, oid: data.branch });
  const parentOid = commit.parent[0];
  if (!parentOid) {
    // This means it's a root commit with no parent. We'll produce a patch vs. empty
    console.warn('Commit has no parent. Generating multi file patch');
    return await generateMultiFilePatchFromEmpty(dir, data.branch);
  }

  const fullPatch = await generateMultiFilePatch(dir, parentOid, data.branch);

  if (data.diffFileHash) {
    const fileToFocus = await mapDiffHashToFile(dir, parentOid, data.branch, data.diffFileHash);
    if (fileToFocus) {
      // produce patch only for that file
      const { type } = fileToFocus;
      const singleFilePatch = await createFilePatch(
        dir,
        parentOid,
        data.branch,
        fileToFocus.filepath,
        type
      );
      if (singleFilePatch.trim()) {
        return singleFilePatch;
      }
    }
  }

  return fullPatch;
}

async function generateMultiFilePatchFromEmpty(dir: string, newOid: string): Promise<string> {
  // If we truly want to produce “added everything” then each file in newOid is “add”.
  // For brevity, we can do a simpler approach: walk newOid vs an empty tree
  return generateMultiFilePatch(dir, '4b825dc642cb6eb9a060e54bf8d69288fbee4904', newOid);
  // The OID '4b825dc642cb6eb9a060e54bf8d69288fbee4904' is a special “empty tree” in Git
}

async function generateMultiFilePatch(dir: string, oldOid: string, newOid: string) {
  const changes = await getFileChanges(dir, oldOid, newOid);

  let combined = '';
  for (const ch of changes) {
    const patch = await createFilePatch(dir, oldOid, newOid, ch.filepath, ch.type);
    if (patch.trim()) {
      combined += patch;
    }
  }
  return combined;
}
// https://github.com/damus-io/nostrdb/commit/64cad19042d4573d6fbfbdcded0f47129a84c438#diff-189f7772bb7cec83d96fa0265451131ec0bc49712fd8c3c1ed3cbfdd79872d05R22
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
  let oldContent = '';
  let newContent = '';
  try {
    // read old file
    if (changeType !== 'add') {
      const { blob } = await git.readBlob({ fs, dir, oid: oldOid, filepath });
      oldContent = Buffer.from(blob).toString('utf8');
    }
    // read new file
    if (changeType !== 'remove') {
      const { blob } = await git.readBlob({ fs, dir, oid: newOid, filepath });
      newContent = Buffer.from(blob).toString('utf8');
    }
  } catch (err) {
    // if reading fails => treat as empty, indicating add/remove
    console.log(`Error: ${err}: reading failed, treating as empty`);
  }

  // create unified diff
  const patch = createPatch(
    filepath,
    oldContent,
    newContent,
    oldOid.slice(0, 7),
    newOid.slice(0, 7)
  );
  return patch;
}

/**
 * Attempt to find which file changed in parentOid..newOid matches
 * the “diff-<hash>” from the GitHub link.
 *
 * This is purely a heuristic. GitHub does some unknown hashing
 * for the anchor. We might guess we can do e.g. a SHA256
 * of “oldOID + newOID + filepath”, or parse the patch and
 * find an anchor. There's no official doc for it.
 *
 * Here, we’ll do a simpler approach:
 * - gather changed files
 * - if exactly 1 changed file => guess that’s the file
 * - if multiple => do a naive approach or fallback to null
 */
async function mapDiffHashToFile(
  dir: string,
  oldOid: string,
  newOid: string,
  diffFileHash: string
) {
  // 1) gather changed files
  const changes = await getFileChanges(dir, oldOid, newOid);
  if (!changes.length) return null;
  if (changes.length === 1) {
    // If there's only one changed file, likely that’s it
    return changes[0];
  }

  // Otherwise, we do some guess. For demonstration,
  // we’ll just see if diffFileHash matches the first 6 chars of the file path, etc.
  for (const c of changes) {
    // a naive example
    if (c.filepath.replace(/[^a-z0-9]/gi, '').includes(diffFileHash.slice(0, 6))) {
      return c;
    }
  }

  // fallback => no match
  return null;
}
