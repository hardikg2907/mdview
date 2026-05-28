import * as cp from 'node:child_process';
import * as path from 'node:path';
import { log } from '../output';

export interface ServerInfo {
  port: number;
  url: string;
}

export interface ServerHandleOpts {
  cliEntryPath: string;
  args: string[];
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

const READY_TIMEOUT_MS = 10_000;
const READY_BUFFER_CAP = 64 * 1024;

export class ServerHandle {
  private child: cp.ChildProcess | undefined;
  private info: ServerInfo | undefined;
  private disposed = false;
  private readyResolved = false;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly opts: ServerHandleOpts) {}

  start(): Promise<ServerInfo> {
    return new Promise((resolve, reject) => {
      let child: cp.ChildProcess;
      try {
        child = cp.spawn(process.execPath, [this.opts.cliEntryPath, ...this.opts.args], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      this.child = child;

      this.readyTimer = setTimeout(() => {
        if (this.readyResolved) return;
        this.readyResolved = true;
        this.readyTimer = undefined;
        log('mdview did not signal ready within 10s; killing child');
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        reject(new Error('mdview ready signal timed out after 10s'));
      }, READY_TIMEOUT_MS);

      const clearReadyTimer = () => {
        if (this.readyTimer) {
          clearTimeout(this.readyTimer);
          this.readyTimer = undefined;
        }
      };

      child.on('error', (err) => {
        if (this.readyResolved) return;
        this.readyResolved = true;
        clearReadyTimer();
        log(`mdview spawn error: ${err.message}`);
        reject(err);
      });

      child.on('exit', (code, signal) => {
        if (!this.readyResolved) {
          this.readyResolved = true;
          clearReadyTimer();
          if (this.disposed) {
            reject(new Error('mdview was disposed before the ready signal arrived'));
          } else {
            reject(new Error(`mdview exited before ready (code=${code} signal=${signal})`));
          }
          return;
        }
        if (this.disposed) return;
        log(`mdview child exited unexpectedly (code=${code} signal=${signal})`);
        this.opts.onExit?.(code, signal as NodeJS.Signals | null);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8').trimEnd();
        if (text) log(`[mdview cli] ${text}`);
      });

      let buf = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        if (this.readyResolved) return;
        buf += chunk.toString('utf8');
        if (buf.length > READY_BUFFER_CAP) {
          this.readyResolved = true;
          clearReadyTimer();
          try { child.kill('SIGTERM'); } catch { /* ignore */ }
          reject(new Error('mdview produced too much output before the ready signal'));
          return;
        }
        const nl = buf.indexOf('\n');
        if (nl < 0) return;
        const line = buf.slice(0, nl).trim();
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          this.readyResolved = true;
          clearReadyTimer();
          try { child.kill('SIGTERM'); } catch { /* ignore */ }
          reject(new Error(`mdview ready line is not valid JSON: ${line}`));
          return;
        }
        if (!isReadyMessage(parsed)) {
          this.readyResolved = true;
          clearReadyTimer();
          try { child.kill('SIGTERM'); } catch { /* ignore */ }
          reject(new Error(`mdview emitted unexpected ready payload: ${line}`));
          return;
        }
        this.info = { port: parsed.port, url: parsed.url };
        this.readyResolved = true;
        clearReadyTimer();
        resolve(this.info);
      });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = undefined;
    }
    const c = this.child;
    this.child = undefined;
    if (!c) return;
    try { c.stdin?.end(); } catch { /* ignore */ }
    // SIGTERM does not exist on Windows; an argument-less kill() terminates the
    // child via the platform-native mechanism instead.
    try {
      if (process.platform === 'win32') {
        c.kill();
      } else {
        c.kill('SIGTERM');
      }
    } catch { /* ignore */ }
  }

  get currentInfo(): ServerInfo | undefined {
    return this.info;
  }
}

function isReadyMessage(v: unknown): v is { event: 'ready'; port: number; url: string } {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  if (m['event'] !== 'ready') return false;
  if (
    typeof m['port'] !== 'number' ||
    !Number.isInteger(m['port']) ||
    m['port'] <= 0 ||
    m['port'] > 65535
  ) return false;
  if (typeof m['url'] !== 'string') return false;
  // Reconstruct the expected prefix from the trusted port value rather than
  // trusting the URL string as-is — prevents a misbehaving child from
  // directing the extension to an unexpected origin.
  const expectedPrefix = `http://127.0.0.1:${m['port']}/`;
  if (!m['url'].startsWith(expectedPrefix)) return false;
  return true;
}

// process.env.NODE_ENV is substituted at bundle time, so the dev override is
// dead-stripped from the shipped extension.
export function bundledCliEntry(extensionPath: string): string {
  if (process.env.NODE_ENV === 'development' && process.env.MDVIEW_CLI_PATH) {
    return process.env.MDVIEW_CLI_PATH;
  }
  return path.join(extensionPath, 'node_modules', '@hardikg', 'mdview', 'bin', 'mdview.mjs');
}
