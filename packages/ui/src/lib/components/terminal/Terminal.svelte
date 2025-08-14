<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import { Terminal } from '@xterm/xterm';
  import { FitAddon } from '@xterm/addon-fit';
  // Import xterm's CSS so the internal helper textarea is hidden and styling is applied
  import '@xterm/xterm/css/xterm.css';
  import { WorkerManager } from '../git/WorkerManager';
  // Instantiate worker via URL like core git-worker client does
  // Lazy import xterm only on mount to avoid SSR issues
  type Stream = 'stdout'|'stderr';

  interface FSLike {
    stat(path: string): Promise<{ type: 'file'|'dir'; size: number }|null>;
    readFile(path: string, encoding?: 'utf8'|'arraybuffer'): Promise<string|Uint8Array>;
    writeFile(path: string, data: string|Uint8Array): Promise<void>;
    readdir(path: string): Promise<string[]>;
    mkdir(path: string): Promise<void>;
    rm(path: string, opts?: { recursive?: boolean }): Promise<void>;
    mv(src: string, dst: string): Promise<void>;
    cp(src: string, dst: string): Promise<void>;
    touch(path: string): Promise<void>;
  }

  interface TerminalProps {
    repoRef: { relay: string; naddr: string; npub: string; repoId: string };
    repoEvent?: import('@nostr-git/shared-types').RepoAnnouncementEvent;
    fs?: FSLike;
    relays: string[];
    theme?: 'retro'|'dark'|'light'|Record<string,string>;
    height?: string | number;
    initialCwd?: string;
    urlAllowlist?: string[];
    outputLimit?: { bytes: number; lines: number; timeMs: number };
    onCommand?: (cmd: string) => void;
    onOutput?: (evt: { stream: Stream; chunk: string }) => void;
    // Optional repo defaults for CLI convenience
    repoCloneUrls?: string[];
    defaultRemoteUrl?: string;
    defaultBranch?: string;
    provider?: string;
    token?: string;
  }

  interface TerminalHandle {
    focus(): void;
    clear(): void;
    runCommand(cmd: string): Promise<number>;
    abort(): void;
  }

  const {
    repoRef,
    fs,
    relays = [],
    theme = 'retro',
    height = 320,
    initialCwd = '/',
    urlAllowlist = [],
    outputLimit = { bytes: 1_000_000, lines: 10_000, timeMs: 30_000 },
    onCommand,
    onOutput,
    repoCloneUrls,
    defaultRemoteUrl,
    defaultBranch,
    repoEvent,
    provider: defaultProvider,
    token: defaultToken,
  } = $props();

  const dispatch = createEventDispatcher();

  let containerEl: HTMLDivElement;
  let term: Terminal;
  let fitAddon: FitAddon;
  let worker: Worker | null = null;
  let wm: WorkerManager | null = null;

  let runningId: string | null = null;
  let cwd = initialCwd ?? '/';
  let history: string[] = [];
  let historyIdx = -1;

  // Toolbar actions
  function doClear() {
    term?.clear();
    dispatch('output', { stream: 'stdout', chunk: '' });
  }

  function printPrompt() {
    term?.write(`\r\n${cwd} $ `);
  }

  function printWelcome() {
    const art = [
      '  Flotilla-Budabit',
      '',
    ].join('\n');
    const help = [
      "  Type 'help' to list available commands.",
      '  Ctrl+C to cancel • Ctrl+L to clear',
      '',
    ].join('\n');
    termWrite('stdout', `\r\n${art}\n${help}`);
  }

  function printHelp(topic?: string) {
    const lines: string[] = [];
    const showFS = !topic || topic.toLowerCase() === 'fs';
    const showGit = !topic || topic.toLowerCase() === 'git';
    lines.push('');
    lines.push('Available commands:');
    if (showFS) {
      lines.push('  FS:');
      lines.push('   - ls [path]              list directory contents');
      lines.push('   - cd <path>              change directory');
      lines.push('   - pwd                    print current directory');
      lines.push('   - cat <file>             print file contents');
      lines.push('   - mkdir <dir>            create directory');
      lines.push('   - rm [-r] <path>         remove file or directory');
      lines.push('   - cp <src> <dst>         copy file or directory');
      lines.push('   - mv <src> <dst>         move/rename file or directory');
      lines.push('   - touch <file>           create empty file');
      lines.push('');
    }
    if (showGit) {
      lines.push('  Git:');
      lines.push('   - git status             show working tree status');
      lines.push('   - git log [--oneline]    show commit history');
      lines.push('   - git fetch              download objects and refs');
      lines.push('   - git pull               fetch and merge (or rebase)');
      lines.push('   - git push               push current branch to remote');
      lines.push('   - git branch             list branches');
      lines.push('   - git checkout <name>    switch branch');
      lines.push('   - git switch <name>      switch branch');
      lines.push('   - git add <paths>        stage changes');
      lines.push('   - git commit -m "msg"    commit staged changes');
      lines.push('   - git diff               show changes');
      lines.push('   - git show <obj>         show object details');
      lines.push('');
    }
    lines.push("Tips: type 'help fs' or 'help git' for a shorter list.");
    termWrite('stdout', lines.join('\n'));
  }

  function termWrite(stream: Stream, text: string) {
    term?.write(text.replace(/\n/g, '\r\n'));
    onOutput?.({ stream, chunk: text });
    dispatch('output', { stream, chunk: text });
  }

  // ---------------- FS Bridge ----------------
  // Provide a default in-memory FS if no fs prop was supplied
  type Stat = { type: 'file'|'dir'; size: number } | null;
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();
  const vfsDirs = new Set<string>(['/']);
  const vfsFiles = new Map<string, Uint8Array>();

  function normPath(p: string): string {
    if (!p) return '/';
    // collapse // and resolve .. and . segments very simply
    const parts = p.split('/');
    const out: string[] = [];
    for (const seg of parts) {
      if (!seg || seg === '.') continue;
      if (seg === '..') { out.pop(); continue; }
      out.push(seg);
    }
    return '/' + out.join('/');
  }
  function parentDir(p: string): string { const n = normPath(p); const i = n.lastIndexOf('/'); return i <= 0 ? '/' : n.slice(0, i); }
  function ensureDirPath(p: string) { const n = normPath(p); if (!vfsDirs.has(n)) vfsDirs.add(n); }

  async function repoExistsDir(path: string): Promise<boolean> {
    if (!repoEvent) return false;
    const mgr = await ensureWM();
    try {
      const rel = path === '/' ? undefined : path.replace(/^\//, '');
      const list = await mgr.listRepoFilesFromEvent({ repoEvent, branch: defaultBranch, path: rel, repoKey: repoRef?.repoId });
      return Array.isArray(list);
    } catch { return false; }
  }
  async function repoExistsFile(path: string): Promise<boolean> {
    if (!repoEvent) return false;
    const mgr = await ensureWM();
    try {
      const rel = path.replace(/^\//, '');
      return await mgr.fileExistsAtCommit({ repoEvent, branch: defaultBranch, path: rel, repoKey: repoRef?.repoId });
    } catch { return false; }
  }
  async function repoRead(path: string, encoding?: 'utf8'|'arraybuffer'): Promise<string|Uint8Array> {
    const mgr = await ensureWM();
    const rel = path.replace(/^\//, '');
    const res = await mgr.getRepoFileContentFromEvent({ repoEvent: repoEvent!, branch: defaultBranch, path: rel, repoKey: repoRef?.repoId });
    const text = typeof res === 'string' ? res : String(res?.text ?? '');
    if (encoding === 'utf8' || !encoding) return text;
    return textEncoder.encode(text);
  }

  const defaultFS: FSLike = {
    async stat(path: string): Promise<Stat> {
      const n = normPath(path);
      if (vfsDirs.has(n)) return { type: 'dir', size: 0 };
      const f = vfsFiles.get(n);
      if (f) return { type: 'file', size: f.byteLength };
      // Fallback to repo-backed read-only view
      if (repoEvent) {
        if (await repoExistsDir(n)) return { type: 'dir', size: 0 };
        if (await repoExistsFile(n)) {
          // Size unknown without fetching; omit or estimate via text length
          return { type: 'file', size: 0 };
        }
      }
      return null;
    },
    async readFile(path: string, encoding?: 'utf8'|'arraybuffer'): Promise<string|Uint8Array> {
      const n = normPath(path);
      const data = vfsFiles.get(n);
      if (data) {
        if (encoding === 'utf8') return textDecoder.decode(data);
        return data;
      }
      if (repoEvent && await repoExistsFile(n)) {
        return await repoRead(n, encoding);
      }
      throw new Error('ENOENT');
    },
    async writeFile(path: string, data: string|Uint8Array): Promise<void> {
      const n = normPath(path);
      const dir = parentDir(n);
      if (!vfsDirs.has(dir)) throw new Error('ENOENT: parent directory');
      const buf = typeof data === 'string' ? textEncoder.encode(data) : new Uint8Array(data);
      vfsFiles.set(n, buf);
    },
    async readdir(path: string): Promise<string[]> {
      const n = normPath(path);
      const seen = new Set<string>();
      if (vfsDirs.has(n)) {
        // Overlay dirs/files
        const prefix = n === '/' ? '/' : n + '/';
        for (const d of vfsDirs) if (d.startsWith(prefix) && d !== n) { const rest = d.slice(prefix.length); if (rest) seen.add(rest.split('/')[0]!); }
        for (const f of vfsFiles.keys()) if (f.startsWith(prefix)) { const rest = f.slice(prefix.length); if (rest) seen.add(rest.split('/')[0]!); }
      }
      // Merge repo directory listing if available
      if (repoEvent) {
        try {
          const mgr = await ensureWM();
          const rel = n === '/' ? undefined : n.replace(/^\//, '');
          const list = await mgr.listRepoFilesFromEvent({ repoEvent, branch: defaultBranch, path: rel, repoKey: repoRef?.repoId });
          if (Array.isArray(list)) for (const entry of list as any[]) {
            const name = typeof entry === 'string' ? entry : (entry?.name ?? String(entry));
            if (name) seen.add(String(name));
          }
        } catch (e: any) {
          if (seen.size === 0) {
            throw new Error(e?.message || String(e) || 'repo listing failed');
          }
        }
      }
      if (!vfsDirs.has(n) && !(repoEvent && await repoExistsDir(n))) throw new Error('ENOTDIR');
      const prefix = n === '/' ? '/' : n + '/';
      return Array.from(seen.values()).sort();
    },
    async mkdir(path: string): Promise<void> {
      const n = normPath(path);
      const dir = parentDir(n);
      if (!vfsDirs.has(dir)) throw new Error('ENOENT: parent directory');
      vfsDirs.add(n);
    },
    async rm(path: string, opts?: { recursive?: boolean }): Promise<void> {
      const n = normPath(path);
      if (vfsFiles.has(n)) { vfsFiles.delete(n); return; }
      if (vfsDirs.has(n)) {
        const hasChildren = Array.from(vfsDirs).some(d => d !== n && d.startsWith(n + '/'))
          || Array.from(vfsFiles.keys()).some(f => f.startsWith(n === '/' ? '/' : n + '/'));
        if (hasChildren && !opts?.recursive) throw new Error('ENOTEMPTY');
        // delete subtree
        for (const d of Array.from(vfsDirs)) if (d === n || d.startsWith(n + '/')) vfsDirs.delete(d);
        for (const f of Array.from(vfsFiles.keys())) if (f === n || f.startsWith(n + '/')) vfsFiles.delete(f);
        return;
      }
      throw new Error('ENOENT');
    },
    async mv(src: string, dst: string): Promise<void> {
      const s = normPath(src), d = normPath(dst);
      // file
      if (vfsFiles.has(s)) {
        const dir = parentDir(d);
        if (!vfsDirs.has(dir)) throw new Error('ENOENT: parent directory');
        vfsFiles.set(d, vfsFiles.get(s)!);
        vfsFiles.delete(s);
        return;
      }
      // dir
      if (vfsDirs.has(s)) {
        const dir = parentDir(d);
        if (!vfsDirs.has(dir)) throw new Error('ENOENT: parent directory');
        vfsDirs.add(d);
        for (const dd of Array.from(vfsDirs)) {
          if (dd === s || dd.startsWith(s + '/')) {
            const rest = dd.slice(s.length);
            vfsDirs.add(normPath(d + rest));
            vfsDirs.delete(dd);
          }
        }
        for (const ff of Array.from(vfsFiles.keys())) {
          if (ff === s || ff.startsWith(s + '/')) {
            const rest = ff.slice(s.length);
            vfsFiles.set(normPath(d + rest), vfsFiles.get(ff)!);
            vfsFiles.delete(ff);
          }
        }
        return;
      }
      throw new Error('ENOENT');
    },
    async cp(src: string, dst: string): Promise<void> {
      const s = normPath(src), d = normPath(dst);
      if (vfsFiles.has(s)) {
        const dir = parentDir(d);
        if (!vfsDirs.has(dir)) throw new Error('ENOENT: parent directory');
        const buf = vfsFiles.get(s)!;
        vfsFiles.set(d, new Uint8Array(buf));
        return;
      }
      if (vfsDirs.has(s)) {
        const dir = parentDir(d);
        if (!vfsDirs.has(dir)) throw new Error('ENOENT: parent directory');
        vfsDirs.add(d);
        for (const dd of Array.from(vfsDirs)) {
          if (dd === s || dd.startsWith(s + '/')) {
            const rest = dd.slice(s.length);
            vfsDirs.add(normPath(d + rest));
          }
        }
        for (const ff of Array.from(vfsFiles.keys())) {
          if (ff === s || ff.startsWith(s + '/')) {
            const rest = ff.slice(s.length);
            const buf = vfsFiles.get(ff)!;
            vfsFiles.set(normPath(d + rest), new Uint8Array(buf));
          }
        }
        return;
      }
      throw new Error('ENOENT');
    },
    async touch(path: string): Promise<void> {
      const n = normPath(path);
      const dir = parentDir(n);
      if (!vfsDirs.has(dir)) throw new Error('ENOENT: parent directory');
      if (!vfsFiles.has(n)) vfsFiles.set(n, new Uint8Array());
    },
  };

  function getFS(): FSLike { return fs || defaultFS; }

  // Ensure data sent back to the terminal worker is structured-cloneable
  function toSerializable<T>(val: T): T {
    try {
      // Drop functions, Proxies, and non-serializable fields
      return JSON.parse(JSON.stringify(val));
    } catch {
      return val;
    }
  }

  async function ensureWM() {
    if (!wm) wm = new WorkerManager((evt) => dispatch('progress', evt));
    if (!wm.isReady) await wm.initialize();
    return wm;
  }

  async function handleGitRpc(op: string, params: any): Promise<any> {
    const mgr = await ensureWM();
    if (op === 'git.status') {
      // Status should not hit the network; print a local placeholder
      const branch = params?.branch || defaultBranch || '';
      const lines = [`On branch ${branch}`, 'nothing to commit, working tree clean'];
      return { text: lines.join('\n') + '\n' };
    }
    if (op === 'git.log') {
      const depth = params.depth ?? 50;
      const branch = params.branch;
      const oneline: boolean = !!params.oneline;
      const hist = await mgr.getCommitHistory({ repoId: params.repoId, branch, depth });
      if (!hist || hist.success === false) {
        throw new Error(hist?.error || 'log unavailable');
      }
      const commits: any[] = hist.commits || hist.items || [];
      const fmt = (c: any) => {
        const sha = (c.oid || c.sha || '').toString();
        const short = sha ? sha.substring(0, 7) : '';
        const msg = (c.message || c.msg || '').split('\n')[0];
        const author = c.author?.name || c.author || '';
        const date = c.author?.timestamp ? new Date(c.author.timestamp * 1000) : (c.date ? new Date(c.date) : null);
        if (oneline) return `${short} ${msg}`;
        return [
          `commit ${sha}`,
          author ? `Author: ${author}` : undefined,
          date ? `Date:   ${date.toISOString()}` : undefined,
          '',
          `    ${msg}`,
          ''
        ].filter(Boolean).join('\n');
      };
      const text = commits.map(fmt).join(oneline ? '\n' : '\n');
      return { text: text.endsWith('\n') ? text : text + '\n' };
    }
    if (op === 'git.add') {
      // Staging is not yet supported in worker API. Return a friendly message.
      return { text: 'warning: staging (git add) is not yet supported in this terminal\n' };
    }
    if (op === 'git.commit') {
      // Committing via CLI not yet wired; commit flows are handled via UI workflows today.
      const msg = params?.message ? ` (${params.message})` : '';
      return { text: `warning: git commit${msg} is not yet supported in this terminal\n` };
    }
    if (op === 'git.push') {
      const { repoId, remoteUrl: ru, branch, provider, token, cloneUrls } = params || {};
      const remoteUrl = ru
        || defaultRemoteUrl
        || (Array.isArray(cloneUrls) && cloneUrls.length > 0 ? cloneUrls[0]
            : (Array.isArray(repoCloneUrls) && repoCloneUrls.length > 0 ? repoCloneUrls[0] : undefined));
      const useProvider = provider ?? defaultProvider;
      const useToken = token ?? defaultToken;
      const useBranch = branch ?? defaultBranch;
      if (!repoId || !remoteUrl) {
        return { text: 'error: git push requires repoId and remoteUrl (or cloneUrls[])\n' };
      }
      try {
        const res = await mgr.safePushToRemote({
          repoId,
          remoteUrl,
          branch: useBranch,
          provider: useProvider,
          token: useToken,
          allowForce: false,
          preflight: {
            blockIfUncommitted: true,
            requireUpToDate: true,
            blockIfShallow: true,
          },
        });
        if (res?.success) {
          const b = res.branch || useBranch || '';
          return { text: `Pushed ${b} to ${remoteUrl}\n` };
        }
        if (res?.requiresConfirmation) {
          return { text: `error: push blocked: ${res?.warning || 'force push requires confirmation'}\n` };
        }
        const reason = res?.reason ? ` (${res.reason})` : '';
        return { text: `error: push blocked${reason}: ${res?.error || 'unknown error'}\n` };
      } catch (e: any) {
        return { text: `error: push exception: ${e?.message || String(e)}\n` };
      }
    }
    if (op === 'git.pull') {
      const { repoId, cloneUrls, branch } = params || {};
      const urls = Array.isArray(cloneUrls) && cloneUrls.length > 0 ? cloneUrls : (repoCloneUrls || []);
      if (!repoId || urls.length === 0) {
        return { text: 'error: git pull requires repoId and cloneUrls[]\n' };
      }
      try {
        const res = await mgr.syncWithRemote({ repoId, cloneUrls: urls, branch: branch ?? defaultBranch });
        if (res?.success) {
          const b = res.branch || branch || defaultBranch || '';
          const head = res.headCommit ? ` (${res.headCommit})` : '';
          return { text: `Updated local ${b} to remote HEAD${head}\n` };
        }
        return { text: `error: pull failed: ${res?.error || 'unknown error'}\n` };
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (msg && msg.includes('Proxy object could not be cloned')) {
          // Comlink tried to transfer a non-serializable/proxied result. Provide a friendly message.
          return { text: 'warning: git pull is not available in this terminal yet (worker returned a non-transferable value). Use the UI Pull action instead.\n' };
        }
        return { text: `error: pull exception: ${msg}\n` };
      }
    }
    if (op === 'git.diff') {
      // Working-tree diff not yet exposed; fallback message.
      return { text: 'warning: git diff is not yet supported in this terminal\n' };
    }
    throw new Error(`Unknown git op: ${op}`);
  }

  async function ensureWorker() {
    if (worker) return;
    // Try compiled JS paths first (dist consumption), fall back to TS in dev
    const candidates = ['./worker/cli.js', './worker/cli.mjs', './worker/cli.ts'];
    let lastErr: any = null;
    for (const rel of candidates) {
      try {
        const u = new URL(rel, import.meta.url);
        try {
          const isLikelyDev = typeof location !== 'undefined' && (
            location.hostname === 'localhost' || location.hostname === '127.0.0.1'
          );
          if (isLikelyDev) {
            u.searchParams.set('v', String(Date.now()));
          }
        } catch {}
        worker = new Worker(u, { type: 'module' });
        break;
      } catch (e) {
        lastErr = e;
        worker = null;
      }
    }
    if (!worker) {
      console.error('[terminal] failed to initialize worker with all fallbacks', lastErr);
      throw lastErr;
    }

    // Initial handshake
    worker.postMessage({ type: 'config', repoRef, urlAllowlist, outputLimit });

    // Surface worker-level errors to the terminal and console for diagnosis
    worker.addEventListener('error', (e: ErrorEvent) => {
      console.error('[terminal-worker:error]', e);
      termWrite('stderr', `[worker] ${e.message}\n`);
    });
    worker.addEventListener('messageerror', (e: MessageEvent) => {
      console.error('[terminal-worker:messageerror]', e);
      termWrite('stderr', `[worker] message error\n`);
    });

    // Stream FS/Git/stdio responses
    worker.onmessage = async (ev: MessageEvent) => {
      const msg = ev.data;
      switch (msg.type) {
        case 'stdout':
          termWrite('stdout', msg.data);
          break;
        case 'stderr':
          termWrite('stderr', msg.data);
          break;
        case 'exit':
          console.debug('[terminal] exit', msg);
          runningId = null;
          dispatch('exit', { code: msg.code });
          printPrompt();
          break;
        case 'progress':
          dispatch('progress', msg);
          break;
        case 'toast':
          dispatch('toast', msg);
          break;
        case 'fs': {
          const { op, id, args } = msg;
          try {
            const f = getFS();
            let result: any;
            if (op === 'stat') result = await f.stat(args[0]);
            else if (op === 'readFile') result = await f.readFile(args[0], args[1]);
            else if (op === 'writeFile') { await f.writeFile(args[0], args[1]); result = true; }
            else if (op === 'readdir') result = await f.readdir(args[0]);
            else if (op === 'mkdir') { await f.mkdir(args[0]); result = true; }
            else if (op === 'rm') { await f.rm(args[0], args[1]); result = true; }
            else if (op === 'mv') { await f.mv(args[0], args[1]); result = true; }
            else if (op === 'cp') { await f.cp(args[0], args[1]); result = true; }
            else if (op === 'touch') { await f.touch(args[0]); result = true; }
            else throw new Error('unsupported fs op');
            const safe = toSerializable(result);
            worker?.postMessage({ type: 'fs:result', id, ok: true, result: safe });
          } catch (e: any) {
            worker?.postMessage({ type: 'fs:result', id, ok: false, error: e?.message || String(e) });
          }
          break;
        }
        case 'git': {
          console.debug('[terminal] git request', msg);
          const { op, id, params } = msg;
          try {
            const result = await handleGitRpc(op, params);
            const safe = toSerializable(result);
            console.debug('[terminal] git result ok', { op, id, result: safe });
            worker?.postMessage({ type: 'git:result', id, ok: true, result: safe });
          } catch (e: any) {
            console.debug('[terminal] git result error', { op, id, error: e?.message || String(e) });
            worker?.postMessage({ type: 'git:result', id, ok: false, error: e?.message || String(e) });
          }
          break;
        }
        // Duplicate FS handler removed; unified handler below uses getFS() overlay
        case 'cwd':
          cwd = msg.path;
          break;
      }
    };
  }

  async function initXterm() {
    fitAddon = new FitAddon();
    term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 12,
      convertEol: true,
      cursorBlink: true,
      theme: (theme ?? 'dark') === 'retro' ? {
        background: '#001b00', foreground: '#00ff66', cursor: '#00ff66', selectionBackground: '#003300'
      } : (theme ?? 'dark') === 'dark' ? undefined : undefined,
    });
    term.loadAddon(fitAddon);
    term.open(containerEl);
    fitAddon.fit();

    // Keyboard handling (Ctrl+C, Ctrl+L, history)
    term.onKey(({ key, domEvent }: any) => {
      // Ctrl+L: clear screen
      if (domEvent.ctrlKey && (domEvent.key === 'l' || domEvent.key === 'L')) {
        domEvent.preventDefault();
        doClear();
        printPrompt();
        return;
      }
      // Up/Down for history
      if (domEvent.key === 'ArrowUp') {
        domEvent.preventDefault();
        if (history.length > 0) {
          historyIdx = historyIdx <= 0 ? history.length - 1 : historyIdx - 1;
          // naive redraw
          term.write(`\r\n`);
          const cmd = history[historyIdx] || '';
          termWrite('stdout', `${cwd} $ ${cmd}`);
          inputBuffer = cmd;
        }
        return;
      }
      if (domEvent.key === 'ArrowDown') {
        domEvent.preventDefault();
        if (history.length > 0) {
          historyIdx = historyIdx >= history.length - 1 ? 0 : historyIdx + 1;
          term.write(`\r\n`);
          const cmd = history[historyIdx] || '';
          termWrite('stdout', `${cwd} $ ${cmd}`);
          inputBuffer = cmd;
        }
        return;
      }
      // Default: push data
      const data = key;
      // Ctrl+C
      if (domEvent.ctrlKey && (domEvent.key === 'c' || domEvent.key === 'C')) {
        domEvent.preventDefault();
        abort();
        printPrompt();
        inputBuffer = '';
        return;
      }
      // Handle Backspace
      if (domEvent.key === 'Backspace' || data === '\x7f') {
        domEvent.preventDefault();
        if (inputBuffer.length > 0) {
          // erase last char visually and from buffer
          inputBuffer = inputBuffer.slice(0, -1);
          term.write('\b \b');
        }
        return;
      }
      // Enter triggers command execution (do not echo '\r')
      if (data === '\r') {
        const line = inputBuffer.replace(/\r/g, '').trim();
        inputBuffer = '';
        // move to next line before command output begins
        term.write('\r\n');
        if (line.length) {
          history.push(line);
          if (history.length > 500) history.shift();
          historyIdx = -1;
          void runCommand(line);
        } else {
          printPrompt();
        }
        return;
      }
      // Echo printable characters and append to buffer
      if (data && data !== '\n') {
        inputBuffer += data;
        term.write(data);
      }
    });

    printWelcome();
    printPrompt();
    window.addEventListener('resize', () => fitAddon?.fit());
  }

  let inputBuffer = '';

  function makeId(): string {
    const g: any = globalThis as any;
    const rnd = () => Math.random().toString(36).slice(2);
    if (g?.crypto && typeof g.crypto.randomUUID === 'function') {
      try { return g.crypto.randomUUID(); } catch {}
    }
    return `${Date.now().toString(36)}-${rnd()}-${rnd()}`;
  }

  export async function runCommand(cmd: string): Promise<number> {
    const tokens = tokenize(cmd);
    const primary = tokens[0]?.toLowerCase();
    if (!primary) { printPrompt(); return 0; }
    // Built-in client commands
    if (primary === 'help' || primary === '?') {
      printHelp(tokens[1]);
      printPrompt();
      return 0;
    }
    if (primary === 'clear' || primary === 'cls') {
      doClear();
      printPrompt();
      return 0;
    }
    await ensureWorker();
    onCommand?.(cmd);
    dispatch('command', { cmd });
    const id = makeId();
    runningId = id;
    worker!.postMessage({ type: 'run', id, cwd, argv: tokens });
    return 0;
  }

  export function abort() {
    if (runningId) {
      worker?.postMessage({ type: 'abort', id: runningId });
    } else {
      termWrite('stdout', '^C');
    }
  }

  export function focus() { term?.focus?.(); }
  export function clear() { doClear(); }

  // Optional helper used by feed-bridge to print hints inline
  export function printHint(text: string) {
    termWrite('stdout', `\r\n[feed] ${text}\n`);
    printPrompt();
  }

  function tokenize(s: string): string[] {
    // Very simple tokenizer with quoted strings
    const out: string[] = [];
    let cur = '';
    let q: '"'|'\''|null = null;
    for (let i=0;i<s.length;i++) {
      const c = s[i];
      if (q) {
        if (c === q) { q = null; continue; }
        cur += c; continue;
      }
      if (c === '"' || c === '\'') { q = c as any; continue; }
      if (/\s/.test(c)) { if (cur) { out.push(cur); cur=''; } continue; }
      cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }

  onMount(async () => {
    await initXterm();
    await ensureWorker();
  });

  onDestroy(() => {
    worker?.terminate();
    worker = null;
  });
</script>

<div class="w-full border rounded-md overflow-hidden bg-background px-1 pt-1 pb-0.5 box-border" style={`height: ${typeof (height ?? 320)==='number'?(height ?? 320)+'px':(height ?? 320)}` }>
  <div bind:this={containerEl} class="w-full h-full"></div>
</div>

