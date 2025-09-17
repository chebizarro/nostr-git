export interface PermalinkData {
  host: string;
  platform: 'github' | 'gitlab' | 'gitea' | 'unknown';
  owner: string;
  repo: string;
  branch: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  isDiff?: boolean;
  diffFileHash?: string;
  diffSide?: 'L' | 'R';
}
/**
 * Determines if the URL is a valid permalink for GitHub, GitLab, or Gitea.
 * @param url - The URL to check.
 * @returns True if the URL is a valid permalink; otherwise, false.
 */
export declare function isPermalink(url: string): boolean;
/**
 * Parses a URL to extract relevant data for GitHub, GitLab, or Gitea.
 * Returns null if the URL is not a valid permalink.
 * @param url - The URL to parse.
 * @returns An object containing the parsed data or null if invalid.
 */
export declare function parsePermalink(url: string): PermalinkData | null;
