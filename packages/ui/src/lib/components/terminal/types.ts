export type Stream = 'stdout' | 'stderr';

export interface FSLike {
  stat(path: string): Promise<{ type: 'file' | 'dir'; size: number } | null>;
  readFile(path: string, encoding?: 'utf8' | 'arraybuffer'): Promise<string | Uint8Array>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  readdir(path: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;
  rm(path: string, opts?: { recursive?: boolean }): Promise<void>;
  mv(src: string, dst: string): Promise<void>;
  cp(src: string, dst: string): Promise<void>;
  touch(path: string): Promise<void>;
}

export interface TerminalProps {
  repoRef: { relay: string; naddr: string; npub: string; repoId: string };
  repoEvent?: import('@nostr-git/shared-types').RepoAnnouncementEvent;
  fs?: FSLike;
  relays: string[];
  theme?: 'retro' | 'dark' | 'light' | Record<string, string>;
  height?: string | number;
  initialCwd?: string;
  urlAllowlist?: string[];
  outputLimit?: { bytes: number; lines: number; timeMs: number };
  onCommand?: (cmd: string) => void;
  onOutput?: (evt: { stream: Stream; chunk: string }) => void;
  repoCloneUrls?: string[];
  defaultRemoteUrl?: string;
  defaultBranch?: string;
  provider?: string;
  token?: string;
}

export interface TerminalHandle {
  focus(): void;
  clear(): void;
  runCommand(cmd: string): Promise<number>;
  abort(): void;
}
