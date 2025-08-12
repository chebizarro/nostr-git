import type { GitProvider } from './provider.js';
import { generateUnifiedDiff } from './git-diff-content.js';

export type PatchContentContext = {
  src: string;
  commit?: string;
  parentCommit?: string;
  baseBranch: string;
  repoAddr: string;
  repoId?: string;
  dir?: string;
  fs?: any;
};

/**
 * Default patch content generator (cover letter style).
 * Tries to read commit metadata via provider.readCommit to enrich the message.
 * This is a lightweight placeholder until a full unified-diff formatter is provided.
 */
export async function defaultGetPatchContent(
  git: GitProvider,
  ctx: PatchContentContext
): Promise<string> {
  const lines: string[] = [];
  const branchName = ctx.src.replace('refs/heads/', '');
  lines.push(`# Patch: ${branchName}`);
  lines.push(`repo: ${ctx.repoAddr}${ctx.repoId ? ` (${ctx.repoId})` : ''}`);
  lines.push(`base: ${ctx.baseBranch}`);
  if (ctx.commit) lines.push(`commit: ${ctx.commit}`);
  if (ctx.parentCommit) lines.push(`parent: ${ctx.parentCommit}`);
  // Try to enrich with commit subject/body
  try {
    if (ctx.commit && git.readCommit) {
      const rc = await git.readCommit({ oid: ctx.commit });
      const c = (rc as any)?.commit || rc;
      const subject = c?.message?.split('\n')[0] || '';
      const body = c?.message?.split('\n').slice(1).join('\n') || '';
      if (subject) {
        lines.push('');
        lines.push(`Subject: ${subject}`);
      }
      if (body) {
        lines.push('');
        lines.push(body);
      }
    }
  } catch {}

  lines.push('');
  lines.push('---');
  lines.push('This is an auto-generated cover letter.');
  // Try to attach a minimal unified diff when possible
  try {
    if (ctx.fs && ctx.dir && ctx.baseBranch && ctx.src) {
      const diff = await generateUnifiedDiff({
        fs: ctx.fs,
        dir: ctx.dir,
        baseRef: ctx.baseBranch,
        headRef: ctx.src,
      });
      lines.push('');
      lines.push(diff);
    } else {
      lines.push('A unified diff can be attached by providing getPatchContent().');
    }
  } catch {
    lines.push('A unified diff can be attached by providing getPatchContent().');
  }
  return lines.join('\n');
}
