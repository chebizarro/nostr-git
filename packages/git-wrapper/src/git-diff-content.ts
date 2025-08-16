import * as git from 'isomorphic-git';

export type UnifiedDiffOptions = {
  fs: any;
  dir: string;
  baseRef: string; // e.g., 'refs/heads/main' or an OID
  headRef: string; // e.g., 'refs/heads/feature' or an OID
};

/**
 * Generate a minimal unified-diff-like text using isomorphic-git walk.
 * This focuses on file-level changes and includes simple headers per file.
 * Hunks are not computed to keep implementation lightweight and portable.
 */
export async function generateUnifiedDiff(opts: UnifiedDiffOptions): Promise<string> {
  const { fs, dir, baseRef, headRef } = opts;
  const changes: Array<{ path: string; status: 'A'|'M'|'D'; a?: string; b?: string }> = [];
  await git.walk({
    fs,
    dir,
    trees: [git.TREE({ ref: baseRef }), git.TREE({ ref: headRef })],
    map: async (filepath: string, [A, B]: any[]) => {
      if (!filepath) return;
      const aType = await A?.type();
      const bType = await B?.type();
      if (aType === 'tree' || bType === 'tree') return;
      if (!A && B) {
        const boid = await B.oid();
        changes.push({ path: filepath, status: 'A', b: boid });
      } else if (A && !B) {
        const aoid = await A.oid();
        changes.push({ path: filepath, status: 'D', a: aoid });
      } else if (A && B) {
        const aoid = await A.oid();
        const boid = await B.oid();
        if (aoid !== boid) changes.push({ path: filepath, status: 'M', a: aoid, b: boid });
      }
    },
  });

  const lines: string[] = [];
  lines.push(`diff --git ${baseRef} ${headRef}`);
  for (const ch of changes) {
    const header = `diff --git a/${ch.path} b/${ch.path}`;
    lines.push(header);
    if (ch.status === 'A') {
      lines.push(`new file mode 100644`);
      lines.push(`index 0000000..${(ch.b || '').slice(0,7)}`);
      lines.push(`--- /dev/null`);
      lines.push(`+++ b/${ch.path}`);
    } else if (ch.status === 'D') {
      lines.push(`deleted file mode 100644`);
      lines.push(`index ${(ch.a || '').slice(0,7)}..0000000`);
      lines.push(`--- a/${ch.path}`);
      lines.push(`+++ /dev/null`);
    } else {
      lines.push(`index ${(ch.a || '').slice(0,7)}..${(ch.b || '').slice(0,7)} 100644`);
      lines.push(`--- a/${ch.path}`);
      lines.push(`+++ b/${ch.path}`);
    }
    // Placeholder hunk header (not computing line-level hunks here)
    lines.push(`@@ 0,0 0,0 @@`);
    lines.push('');
  }
  if (changes.length === 0) lines.push('# No changes');
  return lines.join('\n');
}
