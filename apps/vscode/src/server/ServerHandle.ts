import * as cp from 'node:child_process';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { log } from '../output';

export interface ServerInfo {
  port: number;
  url: string;
  /**
   * The per-launch embed token. The server refuses its page and its API to
   * any request without it, which is what stops another site framing it.
   */
  token: string;
}

/** Must match EMBED_TOKEN_ENV in the CLI. */
const EMBED_TOKEN_ENV = 'MDVIEW_EMBED_TOKEN';

export interface ServerHandleOpts {
  cliEntryPath: string;
  args: string[];
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

const READY_TIMEOUT_MS = 10_000;
const KILL_ESCALATION_MS = 2_000;
const READY_BUFFER_CAP = 64 * 1024;

export class ServerHandle {
  private child: cp.ChildProcess | undefined;
  private info: ServerInfo | undefined;
  private disposed = false;
  private exited = false;
  private readyResolved = false;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;
  private killTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly opts: ServerHandleOpts) {}

  start(): Promise<ServerInfo> {
    return new Promise((resolve, reject) => {
      // New per spawn, so a restarted server never accepts an old page. Passed
      // in the environment because argv is readable by every local user.
      const token = crypto.randomBytes(32).toString('base64url');
      let child: cp.ChildProcess;
      try {
        child = cp.spawn(process.execPath, [this.opts.cliEntryPath, ...this.opts.args], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          env: { ...process.env, [EMBED_TOKEN_ENV]: token },
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
        detachStdout();
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

      const clearKillTimer = () => {
        if (this.killTimer) {
          clearTimeout(this.killTimer);
          this.killTimer = undefined;
        }
      };

      let buf = '';
      const onStdoutData = (chunk: Buffer) => {
        if (this.readyResolved) return;
        buf += chunk.toString('utf8');
        if (buf.length > READY_BUFFER_CAP) {
          this.readyResolved = true;
          clearReadyTimer();
          detachStdout();
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
          detachStdout();
          try { child.kill('SIGTERM'); } catch { /* ignore */ }
          reject(new Error(`mdview ready line is not valid JSON: ${line}`));
          return;
        }
        if (!isReadyMessage(parsed)) {
          this.readyResolved = true;
          clearReadyTimer();
          detachStdout();
          try { child.kill('SIGTERM'); } catch { /* ignore */ }
          reject(new Error(`mdview emitted unexpected ready payload: ${line}`));
          return;
        }
        this.info = { port: parsed.port, url: parsed.url, token };
        this.readyResolved = true;
        clearReadyTimer();
        detachStdout();
        resolve(this.info);
      };

      const detachStdout = () => {
        buf = '';
        child.stdout?.off('data', onStdoutData);
        // Keep draining stdout after detaching our listener so a chatty child
        // can never block on a full OS pipe buffer.
        (child.stdout as { resume?: () => void } | null)?.resume?.();
      };

      child.on('error', (err) => {
        if (this.readyResolved) return;
        this.readyResolved = true;
        clearReadyTimer();
        detachStdout();
        log(`mdview spawn error: ${err.message}`);
        reject(err);
      });

      child.on('exit', (code, signal) => {
        this.exited = true;
        clearKillTimer();
        detachStdout();
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

      child.stdout?.on('data', onStdoutData);
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
        if (!this.exited && (c.exitCode === undefined || c.exitCode === null)) {
          this.killTimer = setTimeout(() => {
            this.killTimer = undefined;
            if (!this.exited) {
              try { c.kill('SIGKILL'); } catch { /* ignore */ }
            }
          }, KILL_ESCALATION_MS);
          this.killTimer.unref?.();
        }
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
