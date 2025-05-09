import type { PermalinkData } from './permalink.js';
export declare function fetchPermalink(data: PermalinkData): Promise<any>;
/**
 * Attempts to guess a file's MIME type from its bytes (accurate),
 * then falls back to extension-based detection
 *
 * @param data - The file data as Uint8Array (optional, but recommended).
 * @param extension - The file extension, e.g. "png" or ".png" (optional).
 * @returns e.g. "image/png", "text/markdown", or "application/octet-stream"
 */
export declare function determineMimeType(data?: Uint8Array, extension?: string): Promise<string>;
/**
 * Produce a Git-style diff (unified patch) for the commit or diff link
 * described in PermalinkData.
 *
 * @param data - PermalinkData from parsePermalink - a parsed GitHub diff URL
 * @returns The entire patch as a string (unified diff) or the error message.
 */
export declare function produceGitDiffFromPermalink(data: PermalinkData): Promise<string>;
/**
 * GitHub diff anchors for blob permalinks use SHA-256 of the file path
 */
export declare function githubPermalinkDiffId(filePath: string): Promise<string>;
/**
 * Attempt to find which file changed in parentOid..newOid matches
 * the “diff-<sha256(path)>” anchor from GitHub blob permalink.
 */
export declare function mapDiffHashToFile(dir: string, oldOid: string, newOid: string, diffFileHash: string): Promise<{
    filepath: string;
    type: 'add' | 'remove' | 'modify';
} | null>;
