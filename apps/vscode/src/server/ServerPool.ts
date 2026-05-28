import type * as vscode from 'vscode';
import { ServerHandle, type ServerInfo, type ServerHandleOpts } from './ServerHandle';
import { log } from '../output';

const SOFT_CAP = 8;

export class ServerPool {
  private readonly handles = new Map<string, ServerHandle>();
  private readonly pending = new Map<string, Promise<ServerInfo>>();

  async getOrStart(
    folderUri: vscode.Uri,
    buildOpts: () => ServerHandleOpts,
  ): Promise<{ handle: ServerHandle; info: ServerInfo }> {
    const key = folderUri.toString();

    const existing = this.handles.get(key);
    if (existing?.currentInfo) {
      return { handle: existing, info: existing.currentInfo };
    }

    const inflight = this.pending.get(key);
    if (inflight) {
      const info = await inflight;
      const h = this.handles.get(key);
      if (!h) throw new Error('mdview pool: handle missing after concurrent start');
      return { handle: h, info };
    }

    if (this.handles.size >= SOFT_CAP) {
      log(
        `mdview pool has ${this.handles.size} live servers in this window; consider closing some workspace folders.`,
      );
    }

    // Capture the caller's onExit once so the pool wrapper can invoke it
    // without calling buildOpts() a second time.
    const userOpts = buildOpts();
    const userOnExit = userOpts.onExit;

    const handle = new ServerHandle({
      ...userOpts,
      onExit: (code, signal) => {
        log(`mdview server for ${key} exited unexpectedly (code=${code} signal=${signal}); removing from pool`);
        this.handles.delete(key);
        userOnExit?.(code, signal);
      },
    });
    this.handles.set(key, handle);

    const startPromise = handle
      .start()
      .catch((err: unknown) => {
        this.handles.delete(key);
        throw err;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, startPromise);

    const info = await startPromise;
    return { handle, info };
  }

  has(folderUri: vscode.Uri): boolean {
    return this.handles.has(folderUri.toString());
  }

  disposeFolder(folderUri: vscode.Uri): void {
    const key = folderUri.toString();
    const h = this.handles.get(key);
    if (!h) return;
    this.handles.delete(key);
    h.dispose();
  }

  disposeAll(): void {
    for (const [, h] of this.handles) h.dispose();
    this.handles.clear();
    this.pending.clear();
  }

  get size(): number {
    return this.handles.size;
  }
}
