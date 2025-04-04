import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { Buffer } from 'buffer';
import { fileTypeFromBuffer } from 'file-type';
import { lookup as mimeLookup } from 'mime-types';

export interface PermalinkData {
  host: string;
  platform: 'github' | 'gitlab' | 'gitea' | 'unknown';
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
}

/**
 * Determines if the URL is a valid permalink for GitHub, GitLab, or Gitea.
 * @param url - The URL to check.
 * @returns True if the URL is a valid permalink; otherwise, false.
 */
export function isPermalink(url: string): boolean {
  const parsed = new URL(url);
  const { hostname, pathname } = parsed;
  const pathParts = pathname.split('/').filter(Boolean);
  const isGitHub = hostname.includes('github') && pathParts.length >= 4;
  const isGitLab = hostname.includes('gitlab') && pathParts.includes('blob');
  const isGitea = hostname.includes('gitea') && pathParts.length >= 5;
  return isGitHub || isGitLab || isGitea;
}

/**
 * Parses a URL to extract relevant data for GitHub, GitLab, or Gitea.
 * Returns null if the URL is not a valid permalink.
 * @param url - The URL to parse.
 * @returns An object containing the parsed data or null if invalid.
 */
export function parsePermalink(url: string): PermalinkData | null {
  try {
    const parsed = new URL(url);
    const { hostname, hash } = parsed;
    let platform: PermalinkData['platform'] = 'unknown';

    if (hostname.includes('github')) {
      platform = 'github';
    } else if (hostname.includes('gitlab')) {
      platform = 'gitlab';
    } else if (hostname.includes('gitea')) {
      platform = 'gitea';
    }

    // Parse line range from #L syntax
    let startLine: number | undefined;
    let endLine: number | undefined;
    const fragment = hash.replace(/^#/, '');
    // e.g. "L10-L20" (GitHub style) or "L1-3" (GitLab style)
    if (fragment.startsWith('L')) {
      // remove the leading 'L'
      const str = fragment.slice(1); // e.g. "10-L20" or "1-3"
      const dashIndex = str.indexOf('-');
      if (dashIndex === -1) {
        // single line, e.g. "#L10"
        startLine = parseInt(str, 10) || undefined;
      } else {
        // e.g. "10-L20" or "1-3"
        // left side is start line
        const startRaw = str.slice(0, dashIndex).replace(/\D/g, '');
        startLine = parseInt(startRaw, 10) || undefined;

        // right side might have an 'L' (GitHub style) or no 'L' (GitLab style)
        let tail = str.slice(dashIndex + 1); // e.g. "L20" or "3"
        tail = tail.replace(/^L/, ''); // remove leading 'L' if present
        const endRaw = tail.replace(/\D/g, '');
        endLine = parseInt(endRaw, 10) || undefined;
      }
    }

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (!pathParts.length) return null;

    let owner = '';
    let repo = '';
    let branch = '';
    let filePath = '';

    switch (platform) {
      case 'github':
        if (pathParts.length < 4) return null;
        owner = pathParts[0];
        repo = pathParts[1];
        if (pathParts[2] !== 'blob') return null;
        branch = pathParts[3];
        filePath = pathParts.slice(4).join('/');
        break;
      case 'gitlab': {
        const blobIndex = pathParts.indexOf('blob');
        if (blobIndex === -1) return null;
        owner = pathParts[0];
        repo = pathParts.slice(1, blobIndex - 1).join('/');
        branch = pathParts[blobIndex + 1];
        filePath = pathParts.slice(blobIndex + 2).join('/');
        break;
      }
      case 'gitea':
        if (pathParts.length < 5) return null;
        owner = pathParts[0];
        repo = pathParts[1];
        if (pathParts[2] !== 'src' || pathParts[3] !== 'commit') return null;
        branch = pathParts[4];
        filePath = pathParts.slice(5).join('/');
        break;
      default:
        // Unknown or not covered
        return null;
    }

    return {
      host: hostname,
      platform,
      owner,
      repo,
      branch,
      filePath,
      startLine,
      endLine
    };
  } catch (err) {
    console.log(err);
    return null;
  }
}

export async function fetchSnippet(data: PermalinkData) {
  const fs = new LightningFS(`${data.owner}/${data.repo}`);
  const dir = `/${data.owner}/${data.repo}`;
  try {
    const isCloned = await isRepoCloned(fs, dir);
    if (!isCloned) {
      // Shallow clone with no checkout
      await git.clone({
        fs,
        http,
        dir,
        corsProxy: 'https://cors.isomorphic-git.org',
        url: `https://${data.host}/${data.owner}/${data.repo}.git`,
        ref: data.branch,
        singleBranch: true,
        depth: 1,
        noCheckout: true
      });
    }
    // Resolve the commit OID for our branch
    const commitOid = await git.resolveRef({ fs, dir, ref: data.branch });

    // Read the contents of the partially checked out file
    const { blob } = await git.readBlob({
      fs,
      dir: dir,
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

async function isRepoCloned(fs: LightningFS, dir: string): Promise<boolean> {
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
  // 1) Attempt to detect type from file bytes if data is provided
  if (data) {
    const ftResult = await fileTypeFromBuffer(data);
    if (ftResult && ftResult.mime) {
      return ftResult.mime;
    }
  }

  // 2) Fallback: guess from file extension if present
  if (extension) {
    // Remove leading "." if user provided a dotted extension
    const cleanedExt = extension.replace(/^\./, '');
    const extBasedMime = mimeLookup(cleanedExt);
    if (extBasedMime) {
      return extBasedMime;
    }
  }

  // 3) If all else fails, default to a generic type
  return 'application/octet-stream';
}
