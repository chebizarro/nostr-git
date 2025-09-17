// Git CLI adapter: maps `git <subcmd> ...` argv to safe operations.
// Designed to be called from the terminal worker. It does not talk to the
// UI directly and avoids transferring non-cloneable objects across the
// worker boundary. Real git operations will be wired to the core worker via
// message-based bridges in a follow-up.

export interface GitCliContext {
  repoRef: { relay: string; naddr: string; npub: string; repoId: string };
  onProgress?: (evt: { phase: string; loaded: number; total?: number; note?: string }) => void;
  // Optional auth/token provider, if needed by remotes (e.g. github.com)
  getAuthToken?: (host: string) => Promise<string | undefined>;
  // RPC bridge into UI thread to call core/worker APIs
  rpc?: (op: string, params: any) => Promise<any>;
}

export interface GitCliResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

function usage(): string {
  return [
    "usage: git <command> [<args>]\n",
    "Common commands:",
    "   status        Show working tree status",
    "   log           Show commit logs",
    "   diff          Show changes",
    "   add           Add file contents to the index",
    "   commit        Record changes to the repository",
    "   push          Update remote refs along with associated objects",
    "   pull          Fetch from and integrate with another repository or a local branch",
    "",
    "Run `git help <command>` for details.",
  ].join("\n");
}

function helpFor(sub?: string): string {
  switch (sub) {
    case "status":
      return "usage: git status\n\nShow working tree status.";
    case "log":
      return "usage: git log [--oneline] [<path>]";
    case "diff":
      return "usage: git diff [<path>]";
    case "show":
      return "usage: git show <object>";
    case "add":
      return "usage: git add <pathspec>...";
    case "commit":
      return "usage: git commit -m <msg>";
    case "push":
      return "usage: git push [--force] [<remote>] [<branch>]";
    case "pull":
      return "usage: git pull [<remote>] [<branch>]";
    case "branch":
      return "usage: git branch";
    case "checkout":
    case "switch":
      return "usage: git checkout <branch> | git switch <branch>";
    default:
      return usage();
  }
}

export async function runGitCli(argv: string[], ctx: GitCliContext): Promise<GitCliResult> {
  // argv looks like: ['git', '<sub>', ...args]
  const sub = argv[1];
  const args = argv.slice(2);

  if (!sub || sub === "help" || args.includes("-h") || args.includes("--help")) {
    const topic = sub === "help" ? args[0] : sub;
    return { code: 0, stdout: helpFor(topic) + "\n" };
  }
  if (sub === "--version" || sub === "-v") {
    return { code: 0, stdout: "git (browser-cli) 0.1.0\n" };
  }

  switch (sub) {
    case "status": {
      if (!ctx.rpc) {
        return { code: 127, stderr: "git status: RPC not available" };
      }
      try {
        const res = await ctx.rpc("git.status", { repoId: ctx.repoRef.repoId });
        return {
          code: 0,
          stdout:
            String(res?.text ?? res ?? "") +
            (String(res?.text ?? res ?? "").endsWith("\n") ? "" : "\n"),
        };
      } catch (e: any) {
        return { code: 1, stderr: `git status: ${e?.message || String(e)}` };
      }
    }
    case "show": {
      if (!ctx.rpc) return { code: 127, stderr: "git show: RPC not available" };
      const object = args.find((a) => !a.startsWith("-"));
      if (!object) return { code: 2, stderr: "git show: missing object id" };
      try {
        const res = await ctx.rpc("git.show", { repoId: ctx.repoRef.repoId, object });
        const text = typeof res === "string" ? res : String(res?.text ?? "");
        return { code: 0, stdout: text.endsWith("\n") ? text : text + "\n" };
      } catch (e: any) {
        return { code: 1, stderr: `git show: ${e?.message || String(e)}` };
      }
    }
    case "log":
      if (!ctx.rpc) {
        return { code: 127, stderr: "git log: RPC not available" };
      }
      try {
        const oneline = args.includes("--oneline");
        const depthIdx = args.findIndex((a) => a === "-n" || a === "--max-count");
        const depth =
          depthIdx !== -1 && args[depthIdx + 1] ? parseInt(args[depthIdx + 1]!, 10) : 50;
        const branchArg = args.find((a) => !a.startsWith("-"));
        const res = await ctx.rpc("git.log", {
          repoId: ctx.repoRef.repoId,
          branch: branchArg,
          depth,
          oneline,
        });
        const text = typeof res === "string" ? res : String(res?.text ?? "");
        return { code: 0, stdout: text.endsWith("\n") ? text : text + "\n" };
      } catch (e: any) {
        return { code: 1, stderr: `git log: ${e?.message || String(e)}` };
      }
    case "branch": {
      if (!ctx.rpc) return { code: 127, stderr: "git branch: RPC not available" };
      try {
        const res = await ctx.rpc("git.branch", { repoId: ctx.repoRef.repoId });
        const text =
          typeof res === "string" ? res : typeof res?.text === "string" ? res.text : undefined;
        if (typeof text === "string") {
          return { code: 0, stdout: text.endsWith("\n") ? text : text + "\n" };
        }
        const list: string[] = Array.isArray(res?.branches)
          ? res.branches
          : Array.isArray(res)
            ? res
            : [];
        const out = list.join("\n");
        return { code: 0, stdout: out ? out + "\n" : "" };
      } catch (e: any) {
        return { code: 1, stderr: `git branch: ${e?.message || String(e)}` };
      }
    }
    case "checkout":
    case "switch": {
      if (!ctx.rpc) return { code: 127, stderr: `git ${sub}: RPC not available` };
      const branch = args.find((a) => !a.startsWith("-"));
      if (!branch) return { code: 2, stderr: `git ${sub}: missing branch` };
      try {
        const res = await ctx.rpc("git.checkout", { repoId: ctx.repoRef.repoId, branch });
        const text =
          typeof res === "string" ? res : String(res?.text ?? `Switched to branch '${branch}'`);
        return { code: 0, stdout: text.endsWith("\n") ? text : text + "\n" };
      } catch (e: any) {
        return { code: 1, stderr: `git ${sub}: ${e?.message || String(e)}` };
      }
    }
    case "diff": {
      if (!ctx.rpc) return { code: 127, stderr: "git diff: RPC not available" };
      const pathArg = args.find((a) => !a.startsWith("-"));
      try {
        const res = await ctx.rpc("git.diff", { repoId: ctx.repoRef.repoId, path: pathArg });
        const text = typeof res === "string" ? res : String(res?.text ?? "");
        return { code: 0, stdout: text.endsWith("\n") ? text : text + "\n" };
      } catch (e: any) {
        return { code: 1, stderr: `git diff: ${e?.message || String(e)}` };
      }
    }
    case "add": {
      if (!ctx.rpc) return { code: 127, stderr: "git add: RPC not available" };
      const paths = args.filter((a) => !a.startsWith("-"));
      try {
        const res = await ctx.rpc("git.add", { repoId: ctx.repoRef.repoId, paths });
        const text = typeof res === "string" ? res : String(res?.text ?? "");
        return { code: 0, stdout: text ? (text.endsWith("\n") ? text : text + "\n") : "" };
      } catch (e: any) {
        return { code: 1, stderr: `git add: ${e?.message || String(e)}` };
      }
    }
    case "commit": {
      if (!ctx.rpc) return { code: 127, stderr: "git commit: RPC not available" };
      const mIdx = args.findIndex((a) => a === "-m" || a === "--message");
      const message = mIdx !== -1 ? args[mIdx + 1] : undefined;
      try {
        const res = await ctx.rpc("git.commit", { repoId: ctx.repoRef.repoId, message });
        const text = typeof res === "string" ? res : String(res?.text ?? "");
        return { code: 0, stdout: text ? (text.endsWith("\n") ? text : text + "\n") : "" };
      } catch (e: any) {
        return { code: 1, stderr: `git commit: ${e?.message || String(e)}` };
      }
    }
    case "push": {
      if (!ctx.rpc) return { code: 127, stderr: "git push: RPC not available" };
      const force = args.includes("--force") || args.includes("-f");
      const [remote, branch] = args.filter((a) => !a.startsWith("-"));
      try {
        const res = await ctx.rpc("git.push", {
          repoId: ctx.repoRef.repoId,
          remote,
          branch,
          force,
        });
        const text = typeof res === "string" ? res : String(res?.text ?? "");
        return { code: 0, stdout: text ? (text.endsWith("\n") ? text : text + "\n") : "" };
      } catch (e: any) {
        return { code: 1, stderr: `git push: ${e?.message || String(e)}` };
      }
    }
    case "pull": {
      if (!ctx.rpc) return { code: 127, stderr: "git pull: RPC not available" };
      const [remote, branch] = args.filter((a) => !a.startsWith("-"));
      try {
        const res = await ctx.rpc("git.pull", { repoId: ctx.repoRef.repoId, remote, branch });
        const text = typeof res === "string" ? res : String(res?.text ?? "");
        return { code: 0, stdout: text ? (text.endsWith("\n") ? text : text + "\n") : "" };
      } catch (e: any) {
        return { code: 1, stderr: `git pull: ${e?.message || String(e)}` };
      }
    }
    default:
      return { code: 2, stderr: `git: unknown subcommand: ${sub}` };
  }
}
