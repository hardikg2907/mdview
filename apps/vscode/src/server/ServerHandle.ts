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

  constructor(private readonly opts: ServerHandleOpts) {}

  start(): Promise<ServerInfo> {
    return new Promise((resolve, reject) => {
      let child: cp.ChildProcess;
      try {
        child = cp.spawn(process.execPath, [this.opts.cliEntryPath, ...this.opts.args], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          // Inherit PATH so the CLI can locate system tools if needed; do not
          // pass the full env explicitly to avoid leaking sensitive vars.
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      this.child = child;

      const timer = setTimeout(() => {
        if (this.readyResolved) return;
        this.readyResolved = true;
        log('mdview did not signal ready within 10s; killing child');
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        reject(new Error('mdview ready signal timed out after 10s'));
      }, READY_TIMEOUT_MS);

      child.on('error', (err) => {
        if (this.readyResolved) return;
        this.readyResolved = true;
        clearTimeout(timer);
        log(`mdview spawn error: ${err.message}`);
        reject(err);
      });

      child.on('exit', (code, signal) => {
        if (!this.readyResolved) {
          this.readyResolved = true;
          clearTimeout(timer);
          reject(new Error(`mdview exited before ready (code=${code} signal=${signal})`));
          return;
        }
        // Suppress the crash callback when the caller already triggered disposal.
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
          clearTimeout(timer);
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
          clearTimeout(timer);
          try { child.kill('SIGTERM'); } catch { /* ignore */ }
          reject(new Error(`mdview ready line is not valid JSON: ${line}`));
          return;
        }
        if (!isReadyMessage(parsed)) {
          this.readyResolved = true;
          clearTimeout(timer);
          try { child.kill('SIGTERM'); } catch { /* ignore */ }
          reject(new Error(`mdview emitted unexpected ready payload: ${line}`));
          return;
        }
        this.info = { port: parsed.port, url: parsed.url };
        this.readyResolved = true;
        clearTimeout(timer);
        resolve(this.info);
      });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const c = this.child;
    this.child = undefined;
    if (!c) return;
    try { c.stdin?.end(); } catch { /* ignore */ }
    // SIGTERM is the graceful signal on POSIX; on Windows kill() sends the
    // equivalent termination without SIGTERM (which doesn't exist there).
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

// In development (NODE_ENV substituted at bundle time to "production" in the
// shipped extension), MDVIEW_CLI_PATH can point to a local CLI build.
// The condition dead-strips in production: "production" === "development" → false,
// so the env var reference is removed from the bundle entirely.
export function bundledCliEntry(extensionPath: string): string {
  if (process.env.NODE_ENV === 'development' && process.env.MDVIEW_CLI_PATH) {
    return process.env.MDVIEW_CLI_PATH;
  }
  return path.join(extensionPath, 'node_modules', '@hardikg', 'mdview', 'bin', 'mdview.mjs');
}
