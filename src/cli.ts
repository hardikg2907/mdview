import path from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from './server/index.js';
import openBrowser from 'open';
import type { RootInfo } from './shared/types.js';

type ParseResult =
  | { kind: 'run'; args: Args }
  | { kind: 'help' }
  | { kind: 'version' };

function printUsage(): void {
  console.error(`
mdview — local markdown viewer

Usage:
  mdview [path]            View file or folder (default: cwd)

Options:
  --port <n>               Port to listen on (default: 7331; auto-fallback)
  --no-open                Don't auto-launch the browser
  --version, -v            Print version and exit
  --help, -h               Show this help

Examples:
  mdview ./docs            Browse a folder
  mdview README.md         View a single file
  mdview --port 9000       Use a specific port
`.trim());
}

interface Args {
  target: string;
  port: number;
  portExplicit: boolean;
  open: boolean;
}

function readVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../package.json'),
    path.resolve(here, '../../package.json'),
  ];
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, 'utf8');
      const v = JSON.parse(raw).version;
      if (typeof v === 'string') return v;
    } catch {
      // try next
    }
  }
  return 'unknown';
}

function parseArgs(argv: string[]): ParseResult {
  const args: Args = { target: '.', port: 7331, portExplicit: false, open: true };
  let targetSet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h' || a === '--help') return { kind: 'help' };
    if (a === '-v' || a === '--version') return { kind: 'version' };
    if (a === '--no-open') { args.open = false; continue; }
    if (a === '--port') {
      const v = argv[++i];
      if (!v) throw new Error('--port requires a number');
      args.port = Number(v);
      if (!Number.isInteger(args.port) || args.port <= 0) throw new Error('Invalid --port');
      args.portExplicit = true;
      continue;
    }
    if (a.startsWith('-')) throw new Error(`Unknown flag: ${a}`);
    if (targetSet) throw new Error(`Unexpected argument: ${a}`);
    args.target = a;
    targetSet = true;
  }
  return { kind: 'run', args };
}

function detectRoot(target: string): { rootAbsPath: string; rootInfo: RootInfo } {
  const abs = path.resolve(target);
  if (!existsSync(abs)) throw new Error(`Path does not exist: ${abs}`);
  const st = statSync(abs);
  if (st.isDirectory()) {
    return {
      rootAbsPath: abs,
      rootInfo: { rootKind: 'dir', rootRelPath: '', rootName: path.basename(abs) },
    };
  }
  if (st.isFile()) {
    return {
      rootAbsPath: path.dirname(abs),
      rootInfo: {
        rootKind: 'file',
        rootRelPath: path.basename(abs),
        rootName: path.basename(abs),
      },
    };
  }
  throw new Error(`Unsupported path type: ${abs}`);
}

function portFinderHint(port: number): string {
  switch (process.platform) {
    case 'darwin':
      return `lsof -nP -iTCP:${port} -sTCP:LISTEN`;
    case 'linux':
      return `ss -ltnp 'sport = :${port}'  (or: lsof -nP -iTCP:${port} -sTCP:LISTEN)`;
    case 'win32':
      return `netstat -ano | findstr :${port}  (then: tasklist /FI "PID eq <pid>")`;
    default:
      return `lsof -nP -iTCP:${port} -sTCP:LISTEN`;
  }
}

async function listen(
  app: Awaited<ReturnType<typeof createServer>>,
  port: number,
  explicit: boolean,
): Promise<number> {
  if (explicit) {
    try {
      await app.listen({ host: '127.0.0.1', port });
      return port;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        throw new Error(
          `Port ${port} is already in use.\n` +
            `Try a different port (e.g. --port ${port + 1}) or stop whatever is bound to ${port}.\n` +
            `Find the process with: ${portFinderHint(port)}`,
        );
      }
      throw err;
    }
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const tryPort = port + attempt;
    try {
      await app.listen({ host: '127.0.0.1', port: tryPort });
      if (attempt > 0) {
        console.log(`port ${port} in use, using ${tryPort} instead`);
      }
      return tryPort;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error('Could not bind a port (tried 10 in a row).');
}

async function main(): Promise<void> {
  let parsed: ParseResult;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    printUsage();
    process.exit(2);
  }
  if (parsed.kind === 'help') { printUsage(); process.exit(0); }
  if (parsed.kind === 'version') { console.log(readVersion()); process.exit(0); }
  const args = parsed.args;

  const { rootAbsPath, rootInfo } = detectRoot(args.target);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDirCandidates = [
    path.resolve(here, '../dist/client'),
    path.resolve(here, '../../dist/client'),
  ];
  const clientDir = clientDirCandidates.find(existsSync);
  if (!clientDir) {
    console.error('Client bundle not found. Run `npm run build:client` first.');
    process.exit(1);
  }

  const app = await createServer({ rootAbsPath, rootInfo, clientDir });
  const boundPort = await listen(app, args.port, args.portExplicit);

  const url =
    rootInfo.rootKind === 'file'
      ? `http://127.0.0.1:${boundPort}/?file=${encodeURIComponent(rootInfo.rootRelPath)}`
      : `http://127.0.0.1:${boundPort}/`;
  console.log(`mdview → ${url}`);
  console.log(`watching: ${rootAbsPath}`);

  if (args.open) await openBrowser(url);

  // Force-exit timeout exists because SSE keeps long-lived connections open, so app.close() can hang.
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      process.exit(130);
    }
    shuttingDown = true;
    console.log('mdview: shutting down...');
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
    try {
      await Promise.race([app.close().catch(() => undefined), timeout]);
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  // Windows does not deliver SIGTERM/SIGHUP — these handlers are no-ops there;
  // Ctrl+C (SIGINT) is the supported way to stop the server on Windows.
  process.on('SIGTERM', shutdown);
  if (process.platform !== 'win32') process.on('SIGHUP', shutdown);
}

function formatError(err: unknown): { message: string; code: number } | null {
  if (!(err instanceof Error)) return null;
  const errno = err as NodeJS.ErrnoException;
  if (errno.code === 'ENOENT') {
    return { message: `mdview: path not found${errno.path ? `: ${errno.path}` : ''}`, code: 1 };
  }
  if (errno.code === 'EACCES') {
    return { message: `mdview: permission denied${errno.path ? `: ${errno.path}` : ''}`, code: 1 };
  }
  const msg = err.message;
  if (msg.startsWith('Port ')) return { message: msg, code: 1 };
  if (msg.startsWith('Client bundle not found')) return { message: `mdview: ${msg}`, code: 1 };
  if (
    msg.startsWith('Path does not exist') ||
    msg.startsWith('Unsupported path type') ||
    msg.startsWith('Could not bind a port') ||
    msg.startsWith('Unexpected argument')
  ) {
    return { message: `mdview: ${msg}`, code: 1 };
  }
  return null;
}

main().catch((err) => {
  const known = formatError(err);
  if (known) {
    console.error(known.message);
    process.exit(known.code);
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(`mdview: unexpected error: ${message}`);
  if (process.env.MDVIEW_DEBUG === '1' && err instanceof Error && err.stack) {
    console.error(err.stack);
  } else {
    console.error('(set MDVIEW_DEBUG=1 for full stack)');
  }
  process.exit(1);
});
