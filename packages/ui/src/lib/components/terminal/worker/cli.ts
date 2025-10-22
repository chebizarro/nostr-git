// Terminal Worker CLI
// - Message protocol with UI
// - Builtins: pwd, echo, cd, ls, cat, mkdir, rm -r, mv, cp, head, tail, touch
// - curl/wget with allowlist and limits
// - git routed to adapter (streams via stdout/stderr)
export type UIToWorker =
  | {
      type: "config";
      repoRef: { relay: string; naddr: string; npub: string; repoId: string };
      urlAllowlist?: string[];
      outputLimit?: { bytes: number; lines: number; timeMs: number };
    }
  | { type: "run"; id: string; cwd: string; argv: string[]; env?: Record<string, string> }
  | { type: "abort"; id: string }
  | { type: "fs:result"; id: string; ok: boolean; result?: any; error?: string }
  | { type: "git:result"; id: string; ok: boolean; result?: any; error?: string };

export type WorkerToUI =
  | { type: "stdout"; id: string; data: string }
  | { type: "stderr"; id: string; data: string }
  | { type: "exit"; id: string; code: number }
  | { type: "progress"; phase: string; loaded: number; total?: number; note?: string }
  | { type: "toast"; level: "info" | "warn" | "error"; message: string }
  | { type: "fs"; op: string; id: string; args: any[] }
  | { type: "git"; op: string; id: string; params: any }
  | { type: "cwd"; path: string };

postMessage({ type: "ready" } as any);

let repoRef: { relay: string; naddr: string; npub: string; repoId: string } | null = null;
let urlAllowlist: string[] = [];
let outputLimit = { bytes: 1_000_000, lines: 10_000, timeMs: 60_000 };

const running = new Map<string, { aborted: boolean; started: number }>();
let cwd = "/";

// Path utilities
function normalizePath(p: string): string {
  if (!p) return "/";
  const parts = p.split("/");
  const out: string[] = [];
  for (const seg of parts) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return "/" + out.join("/");
}
function resolvePath(base: string, rel: string): string {
  if (!rel || rel === "/") return "/";
  return rel.startsWith("/")
    ? normalizePath(rel)
    : normalizePath(base.replace(/\/$/, "") + "/" + rel);
}

// Safe ID generator (some worker environments may lack crypto.randomUUID)
function makeId(): string {
  const g: any = self as any;
  const rnd = () => Math.random().toString(36).slice(2);
  if (g?.crypto && typeof g.crypto.randomUUID === "function") {
    try {
      return g.crypto.randomUUID();
    } catch (e) {
      /* randomUUID not available/use fallback */
    }
  }
  return `${Date.now().toString(36)}-${rnd()}-${rnd()}`;
}

// Output limiter
function limitAndWrite(id: string, data: string, stream: "stdout" | "stderr") {
  const lines = data.split(/\n/);
  let writtenBytes = 0;
  let writtenLines = 0;
  for (const line of lines) {
    if (writtenBytes + line.length > outputLimit.bytes || writtenLines + 1 > outputLimit.lines) {
      const msg = "\n[output truncated]\n";
      if (stream === "stdout") {
        stdout(id, msg);
      } else {
        stderr(id, msg);
      }
      return;
    }
    if (stream === "stdout") {
      stdout(id, line + "\n");
    } else {
      stderr(id, line + "\n");
    }
    writtenBytes += line.length + 1;
    writtenLines += 1;
  }
}

function stdout(id: string, data: string) {
  postMessage({ type: "stdout", id, data } satisfies WorkerToUI as any);
}
function stderr(id: string, data: string) {
  postMessage({ type: "stderr", id, data } satisfies WorkerToUI as any);
}
function exit(id: string, code: number) {
  postMessage({ type: "exit", id, code } satisfies WorkerToUI as any);
}
function setCwd(path: string) {
  cwd = path;
  postMessage({ type: "cwd", path } satisfies WorkerToUI as any);
}

function fsReq(op: string, args: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = makeId();
    const onMsg = (ev: MessageEvent<UIToWorker>) => {
      const msg = ev.data as any;
      if (msg && msg.type === "fs:result" && msg.id === id) {
        (self as any).removeEventListener("message", onMsg);
        if (msg.ok) resolve(msg.result);
        else reject(new Error(msg.error || "FS error"));
      }
    };
    (self as any).addEventListener("message", onMsg);
    postMessage({ type: "fs", op, id, args } satisfies WorkerToUI as any);
  });
}

function gitReq(op: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = makeId();
    const onMsg = (ev: MessageEvent<UIToWorker>) => {
      const msg = ev.data as any;
      if (msg && msg.type === "git:result" && msg.id === id) {
        (self as any).removeEventListener("message", onMsg);
        if (msg.ok) resolve(msg.result);
        else reject(new Error(msg.error || "Git RPC error"));
      }
    };
    (self as any).addEventListener("message", onMsg);
    postMessage({ type: "git", op, id, params } satisfies WorkerToUI as any);
  });
}

async function runBuiltin(id: string, argv: string[]): Promise<number> {
  const cmd = argv[0];
  switch (cmd) {
    case "pwd":
      stdout(id, cwd + "\n");
      return 0;
    case "echo":
      stdout(id, argv.slice(1).join(" ") + "\n");
      return 0;
    case "cd": {
      const targetArg = argv[1] || "/";
      const next = resolvePath(cwd, targetArg);
      try {
        const st = await fsReq("stat", [next]);
        if (!st || st.type !== "dir") {
          stderr(id, `cd: not a directory: ${targetArg}\n`);
          return 1;
        }
        setCwd(next.replace(/\/$/, ""));
        return 0;
      } catch (e: any) {
        stderr(id, `cd: ${e.message || e}\n`);
        return 1;
      }
    }
    case "ls": {
      const targetArg =
        argv.find((a) => !a.startsWith("-")) && argv.find((a) => !a.startsWith("-")) !== "ls"
          ? (argv.find((a) => !a.startsWith("-")) as string)
          : null;
      const target = targetArg ? resolvePath(cwd, targetArg) : cwd;
      try {
        const entries: string[] = await fsReq("readdir", [target]);
        stdout(id, entries.join("\t") + "\n");
        return 0;
      } catch (e: any) {
        stderr(id, `ls: ${e.message || e}\n`);
        return 1;
      }
    }
    case "cat": {
      const target = argv[1]
        ? argv[1].startsWith("/")
          ? argv[1]
          : cwd.replace(/\/$/, "") + "/" + argv[1]
        : null;
      if (!target) {
        stderr(id, "cat: missing file\n");
        return 1;
      }
      try {
        const data = await fsReq("readFile", [target, "utf8"]);
        limitAndWrite(id, String(data), "stdout");
        return 0;
      } catch (e: any) {
        stderr(id, `cat: ${e.message || e}\n`);
        return 1;
      }
    }
    case "mkdir": {
      const target = argv[1]
        ? argv[1].startsWith("/")
          ? argv[1]
          : cwd.replace(/\/$/, "") + "/" + argv[1]
        : null;
      if (!target) {
        stderr(id, "mkdir: missing operand\n");
        return 1;
      }
      try {
        await fsReq("mkdir", [target]);
        return 0;
      } catch (e: any) {
        stderr(id, `mkdir: ${e.message || e}\n`);
        return 1;
      }
    }
    case "rm": {
      const recursive = argv.includes("-r") || argv.includes("-R");
      const files = argv.filter((a) => !a.startsWith("-")).slice(1);
      if (!files.length) {
        stderr(id, "rm: missing operand\n");
        return 1;
      }
      for (const f of files) {
        const target = f.startsWith("/") ? f : cwd.replace(/\/$/, "") + "/" + f;
        try {
          await fsReq("rm", [target, { recursive }]);
        } catch (e: any) {
          stderr(id, `rm: ${e.message || e}\n`);
          return 1;
        }
      }
      return 0;
    }
    case "mv": {
      const [src, dst] = argv.slice(1);
      if (!src || !dst) {
        stderr(id, "mv: missing file operand\n");
        return 1;
      }
      const s = src.startsWith("/") ? src : cwd.replace(/\/$/, "") + "/" + src;
      const d = dst.startsWith("/") ? dst : cwd.replace(/\/$/, "") + "/" + dst;
      try {
        await fsReq("mv", [s, d]);
        return 0;
      } catch (e: any) {
        stderr(id, `mv: ${e.message || e}\n`);
        return 1;
      }
    }
    case "cp": {
      const [src, dst] = argv.slice(1);
      if (!src || !dst) {
        stderr(id, "cp: missing file operand\n");
        return 1;
      }
      const s = src.startsWith("/") ? src : cwd.replace(/\/$/, "") + "/" + src;
      const d = dst.startsWith("/") ? dst : cwd.replace(/\/$/, "") + "/" + dst;
      try {
        await fsReq("cp", [s, d]);
        return 0;
      } catch (e: any) {
        stderr(id, `cp: ${e.message || e}\n`);
        return 1;
      }
    }
    case "head":
    case "tail": {
      const file = argv[1]
        ? argv[1].startsWith("/")
          ? argv[1]
          : cwd.replace(/\/$/, "") + "/" + argv[1]
        : null;
      const nOptIdx = Math.max(argv.indexOf("-n"), argv.indexOf("--lines"));
      const n = nOptIdx !== -1 ? parseInt(argv[nOptIdx + 1] || "10", 10) : 10;
      if (!file) {
        stderr(id, `${cmd}: missing file\n`);
        return 1;
      }
      try {
        const data = String(await fsReq("readFile", [file, "utf8"]));
        const all = data.split(/\n/);
        const slice = cmd === "head" ? all.slice(0, n) : all.slice(Math.max(0, all.length - n));
        limitAndWrite(id, slice.join("\n"), "stdout");
        if (!data.endsWith("\n")) stdout(id, "\n");
        return 0;
      } catch (e: any) {
        stderr(id, `${cmd}: ${e.message || e}\n`);
        return 1;
      }
    }
    case "touch": {
      const file = argv[1]
        ? argv[1].startsWith("/")
          ? argv[1]
          : cwd.replace(/\/$/, "") + "/" + argv[1]
        : null;
      if (!file) {
        stderr(id, "touch: missing file\n");
        return 1;
      }
      try {
        await fsReq("touch", [file]);
        return 0;
      } catch (e: any) {
        stderr(id, `touch: ${e.message || e}\n`);
        return 1;
      }
    }
  }
  return -1; // not a builtin
}

async function route(id: string, argv: string[]): Promise<number> {
  const started = Date.now();
  running.set(id, { aborted: false, started });
  const cmd = argv[0];
  try {
    // Builtins first
    const bi = await runBuiltin(id, argv);
    if (bi !== -1) return bi;

    if (cmd === "git") {
      // Ensure bundlers include the adapter while still resolving correctly at runtime.
      // Primary attempt: relative import so svelte-package bundles the module.
      let runGitCliMod: any;
      try {
        runGitCliMod = await import("../git-cli-adapter.js");
      } catch (err) {
        const baseFromWorker = (() => {
          try {
            const p = self.location?.pathname || "/";
            const idx = p.indexOf("/_app/");
            return idx >= 0 ? p.slice(0, idx) || "/" : "/";
          } catch {
            return "/";
          }
        })();
        const basePrefix = baseFromWorker === "/"
          ? ""
          : baseFromWorker.endsWith("/")
            ? baseFromWorker.slice(0, -1)
            : baseFromWorker;
        const gitCliAdapterUrl = `${basePrefix}/_app/immutable/git-cli-adapter.js`;
        runGitCliMod = await import(gitCliAdapterUrl);
      }
      const { runGitCli } = runGitCliMod;
      const res = await runGitCli(argv, {
        repoRef: repoRef!,
        onProgress: (evt: any) => postMessage({ type: "progress", ...evt } as any),
        rpc: (op: string, params: any) => gitReq(op, params),
      });
      if (res.stdout) limitAndWrite(id, res.stdout, "stdout");
      if (res.stderr) limitAndWrite(id, res.stderr, "stderr");
      return res.code;
    }
    if (cmd === "curl" || cmd === "wget") {
      const urlArg = argv.find((a) => a.startsWith("http"));
      let outPath: string | null = null;
      const oIdx = argv.indexOf("-o");
      if (oIdx !== -1)
        outPath = argv[oIdx + 1]
          ? argv[oIdx + 1].startsWith("/")
            ? argv[oIdx + 1]
            : cwd.replace(/\/$/, "") + "/" + argv[oIdx + 1]
          : null;
      if (!urlArg) {
        stderr(id, `${cmd}: missing URL\n`);
        return 2;
      }
      const u = new URL(urlArg);
      if (urlAllowlist.length === 0) {
        if (u.protocol !== "https:") {
          stderr(id, `${cmd}: only https:// allowed\n`);
          return 2;
        }
      } else {
        const allowed = urlAllowlist.some((p) => urlArg.startsWith(p));
        if (!allowed) {
          stderr(id, `${cmd}: URL not allowed\n`);
          return 2;
        }
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), Math.min(outputLimit.timeMs, 15000));
      try {
        const r = await fetch(urlArg, { signal: ctrl.signal });
        if (!r.ok) {
          stderr(id, `${cmd}: HTTP ${r.status}\n`);
          return 22;
        }
        const reader = r.body?.getReader();
        let loaded = 0;
        const chunks: Uint8Array[] = [];
        const max = 20 * 1024 * 1024; // 20 MB
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          loaded += value?.length || 0;
          if (loaded > max) {
            stderr(id, `${cmd}: download exceeds 20MB limit\n`);
            return 27;
          }
          postMessage({ type: "progress", phase: "download", loaded, total: undefined } as any);
          chunks.push(value!);
        }
        const blob = new Blob(chunks);
        if (outPath) {
          const buf = new Uint8Array(await blob.arrayBuffer());
          await fsReq("writeFile", [outPath, buf]);
          stdout(id, `${cmd}: saved ${loaded} bytes to ${outPath}\n`);
        } else {
          const text = await blob.text();
          limitAndWrite(id, text, "stdout");
        }
        return 0;
      } catch (e: any) {
        if (e?.name === "AbortError") {
          stderr(id, `${cmd}: request timed out\n`);
          return 28;
        }
        stderr(id, `${cmd}: ${e?.message || String(e)}\n`);
        return 1;
      } finally {
        clearTimeout(t);
      }
    }
    stderr(id, `${cmd}: command not found\n`);
    return 127;
  } finally {
    running.delete(id);
  }
}

(self as any).onmessage = async (ev: MessageEvent<UIToWorker>) => {
  const msg = ev.data;
  if (msg.type === "config") {
    repoRef = msg.repoRef;
    urlAllowlist = msg.urlAllowlist || [];
    outputLimit = msg.outputLimit || outputLimit;
    return;
  }
  if (msg.type === "abort") {
    const r = running.get(msg.id);
    if (r) {
      r.aborted = true;
      stderr(msg.id, "^C\n");
      exit(msg.id, 130);
    }
    return;
  }
  if (msg.type === "run") {
    const { id, argv, cwd: startCwd } = msg;
    if (startCwd && startCwd !== cwd) setCwd(startCwd);
    // Enforce runtime limit
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleTimeout = (ms: number) => {
      if (timer) clearTimeout(timer);
      if (ms === Infinity) {
        timer = null;
        return;
      }
      timer = setTimeout(() => {
        const r = running.get(id);
        if (r) {
          r.aborted = true;
          stderr(id, "command timed out\n");
          exit(id, 124);
        }
      }, ms);
    };

    const subcmd = argv[0] === "git" ? argv[1] || "" : "";
    if (argv[0] === "git") {
      // Git RPC commands can legitimately take a while; don't force-timeout unless
      // the UI provided an explicit cap.
      const ms = outputLimit.timeMs;
      scheduleTimeout(
        Number.isFinite(ms) && ms > 0 && ms < Infinity ? Math.max(ms, 5 * 60_000) : Infinity
      );
    } else {
      const ms = outputLimit.timeMs;
      scheduleTimeout(Number.isFinite(ms) && ms > 0 ? ms : Infinity);
    }
    try {
      const code = await route(id, argv);
      if (timer) clearTimeout(timer);
      exit(id, code);
    } catch (e: any) {
      if (timer) clearTimeout(timer);
      stderr(id, (e?.message || String(e)) + "\n");
      exit(id, 1);
    }
  }
};
