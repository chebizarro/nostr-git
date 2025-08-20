import { getGitProvider } from './git-provider.js';
import { canonicalRepoKey } from './utils/canonicalRepoKey.js';
import { fileTypeFromBuffer } from 'file-type';
import { createPatch } from 'diff';
import type { RepoAnnouncement } from '@nostr-git/shared-types';
import type { PermalinkData } from './permalink.js';
import { Buffer } from 'buffer';

// Only set Buffer on window if we're in a browser context (not in a worker)
if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
  (window as any).Buffer = Buffer;
}

export const rootDir = '/repos';

/**
 * Detect the default branch name from a repository's HEAD reference
 * @param repoEvent Repository event
 * @returns Promise resolving to the default branch name
 */
export async function detectDefaultBranch(repoEvent: RepoAnnouncement, repoKey?: string): Promise<string> {
  const git = getGitProvider();
  const dir = `${rootDir}/${repoKey || canonicalRepoKey(repoEvent.repoId)}`;
  
  try {
    // First try to get the symbolic ref for HEAD
    const headRef = await git.resolveRef({ dir, ref: 'HEAD', depth: 2 });
    
    // If HEAD points to a symbolic ref, extract the branch name
    if (headRef && typeof headRef === 'string' && headRef.startsWith('refs/heads/')) {
      return headRef.replace('refs/heads/', '');
    }
    
    // Fallback: try to list refs and find the default branch
    const refs = await git.listRefs({ dir });
    
    // Look for common default branch names in order of preference
    const commonDefaults = ['main', 'master', 'develop', 'dev'];
    for (const defaultName of commonDefaults) {
      const fullRef = `refs/heads/${defaultName}`;
      if (refs.some((ref: any) => ref.ref === fullRef)) {
        return defaultName;
      }
    }
    
    // If no common defaults found, use the first branch
    const firstBranch = refs.find((ref: any) => ref.ref.startsWith('refs/heads/'));
    if (firstBranch) {
      return firstBranch.ref.replace('refs/heads/', '');
    }
    
  } catch (error) {
    console.warn('Failed to detect default branch:', error);
  }
  
  // Ultimate fallback
  return 'main';
}

/**
 * Get the default branch for a repository, with caching
 */
const defaultBranchCache = new Map<string, string>();

export async function getDefaultBranch(repoEvent: RepoAnnouncement, repoKey?: string): Promise<string> {
  const cacheKey = repoKey || canonicalRepoKey(repoEvent.repoId);
  
  if (defaultBranchCache.has(cacheKey)) {
    return defaultBranchCache.get(cacheKey)!;
  }
  
  const defaultBranch = await detectDefaultBranch(repoEvent, repoKey);
  defaultBranchCache.set(cacheKey, defaultBranch);
  
  return defaultBranch;
}

/**
 * Robust branch resolution that tries multiple common branch names
 * @param git Git provider instance
 * @param dir Repository directory
 * @param preferredBranch Preferred branch name to try first
 * @param options Optional configuration for error handling
 * @returns Promise resolving to the OID of the resolved branch
 */
export async function resolveRobustBranch(
  git: any,
  dir: string,
  preferredBranch?: string,
  options?: { onBranchNotFound?: (branchName: string, error: any) => void }
): Promise<string> {
  const branchesToTry = [
    preferredBranch,
    'main',
    'master', 
    'develop',
    'dev'
  ].filter(Boolean) as string[];
  
  let lastError = null;
  
  for (const branchName of branchesToTry) {
    try {
      const oid = await git.resolveRef({ dir, ref: branchName });
      console.log(`Successfully resolved branch '${branchName}' to OID: ${oid.substring(0, 8)}`);
      return oid;
    } catch (branchError: any) {
      // Call the callback if provided for better error handling
      if (options?.onBranchNotFound) {
        options.onBranchNotFound(branchName, branchError);
      } else {
        console.log(`Failed to resolve branch '${branchName}':`, branchError.message || String(branchError));
      }
      lastError = branchError;
      continue;
    }
  }
  
  throw lastError || new Error('Failed to resolve any common default branch');
}

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
  } else {
    console.log(`Repository already cloned at ${dir}`);
    git.fetch({ dir, ref: opts.branch });
  }
}

export async function ensureRepoFromEvent(opts: { repoEvent: RepoAnnouncement; branch?: string; repoKey?: string }, depth: number = 1) {
  const git = getGitProvider();
  const dir = `${rootDir}/${opts.repoKey || canonicalRepoKey(opts.repoEvent.repoId)}`;

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

  const isCloned = await isRepoCloned(dir);
  
  // Determine the branch to use
  let targetBranch = opts.branch;
  
  if (!targetBranch) {
    if (isCloned) {
      // If repo exists, detect the actual default branch
      try {
        targetBranch = await detectDefaultBranch(opts.repoEvent, opts.repoKey);
      } catch (error) {
        console.warn('Failed to detect default branch, will use robust resolution after clone:', error);
        targetBranch = 'main'; // Temporary, will be resolved robustly after clone
      }
    } else {
      // For initial clone, try common defaults and let git figure it out
      targetBranch = 'main'; // Temporary start, will be resolved robustly after clone
    }
  }
  
  if (!isCloned) {
    console.log(`Cloning ${cloneUrl} to ${dir} (depth: ${depth})`);
    
    // Create a timeout promise to prevent infinite stalling
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Clone operation timed out after 60 seconds')), 60000);
    });

    // Try to clone without specifying a branch first (let git use default)
    const clonePromise = git.clone({
      dir,
      url: cloneUrl,
      // Don't specify ref initially - let git use the remote's default
      singleBranch: false, // Allow git to determine the default branch
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
      
      // After successful clone, detect the actual default branch
      try {
        const actualDefault = await detectDefaultBranch(opts.repoEvent, opts.repoKey);
        defaultBranchCache.set(opts.repoKey || canonicalRepoKey(opts.repoEvent.repoId), actualDefault);
        console.log(`Detected default branch: ${actualDefault}`);
      } catch (error) {
        console.warn('Failed to detect default branch after clone:', error);
      }
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
  } else if (depth > 1) {
    // Repository exists but might be shallow - try to deepen it if we need more history
    try {
      console.log(`Repository exists at ${dir}, attempting to fetch more history (depth: ${depth})`);
      
      // Use robust branch resolution instead of hardcoded fallback
      const resolvedBranch = await resolveRobustBranch(git, dir, targetBranch);
      
      try {
        await git.fetch({
          dir,
          url: cloneUrl,
          ref: resolvedBranch,
          depth,
          singleBranch: true,
        });
        console.log(`Successfully deepened repository using resolved branch '${resolvedBranch}' to depth ${depth}`);
      } catch (fetchError: any) {
        console.log(`Failed to fetch resolved branch '${resolvedBranch}':`, fetchError.message || String(fetchError));
        throw fetchError;
      }
    } catch (error) {
      console.warn(`Failed to deepen repository, continuing with existing clone:`, error);
      // Continue with existing clone even if deepening fails
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
    const ext = extension.replace(/^\./, '').toLowerCase();
    const map: Record<string, string> = {
      // text/code
      md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain',
      html: 'text/html', css: 'text/css',
      js: 'application/javascript', mjs: 'application/javascript', cjs: 'application/javascript',
      ts: 'application/typescript', tsx: 'application/typescript', jsx: 'text/jsx',
      json: 'application/json', yaml: 'application/x-yaml', yml: 'application/x-yaml',
      svelte: 'text/svelte', vue: 'text/vue',
      // images
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp',
      // fonts
      ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
      // archives
      zip: 'application/zip', gz: 'application/gzip', tar: 'application/x-tar', tgz: 'application/gzip',
      // docs
      pdf: 'application/pdf'
    };
    const extBasedMime = map[ext];
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
