import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import openBrowser from 'open';
import { runConfigSubcommand } from './cli-config.js';
import { createServer } from './server/index.js';
import { PALETTES, type Palette, type RootInfo } from './shared/types.js';

export type ParseResult =
  | { kind: 'run'; args: Args }
  | { kind: 'help' }
  | { kind: 'version' };

function printUsage(): void {
  console.error(`
mdview — local markdown viewer

Usage:
  mdview [path]            View file or folder (default: cwd)
  mdview config <…>        Read or edit the global config (run 'mdview config -h')

Options:
  --port <n>               Port to listen on (default: 7331; auto-fallback)
  --no-open                Don't auto-launch the browser
  --palette <name>         Override the palette for this run (one of: ${PALETTES.join(', ')})
  --version, -v            Print version and exit
  --help, -h               Show this help

Examples:
  mdview ./docs                          Browse a folder
  mdview README.md                       View a single file
  mdview --port 9000                     Use a specific port
  mdview config ignore add deps _site    Hide extra build dirs globally
  mdview config path                     Print global config path
`.trim());
}

export interface Args {
  target: string;
  port: number;
  portExplicit: boolean;
  open: boolean;
  embedMode: boolean;
  palette?: Palette;
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

export function parseArgs(argv: string[]): ParseResult {
  const args: Args = { target: '.', port: 7331, portExplicit: false, open: true, embedMode: false };
  let targetSet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h' || a === '--help') return { kind: 'help' };
    if (a === '-v' || a === '--version') return { kind: 'version' };
    if (a === '--no-open') { args.open = false; continue; }
    if (a === '--vscode') { args.embedMode = true; continue; }
    if (a === '--port') {
      const v = argv[++i];
      if (!v) throw new Error('--port requires a number');
      args.port = Number(v);
      if (!Number.isInteger(args.port) || args.port < 0) throw new Error('Invalid --port');
      args.portExplicit = true;
      continue;
    }
    if (a === '--palette') {
      const v = argv[++i];
      if (!v) throw new Error('--palette requires a value');
      // Why: --palette is user input fed straight into the API response. Lock
      // it to the exhaustive allow-list — never accept free-form values.
      if (!(PALETTES as readonly string[]).includes(v)) {
        throw new Error(`Invalid --palette '${v}'. Valid: ${PALETTES.join(', ')}`);
      }
      args.palette = v as Palette;
      continue;
    }
    if (a.startsWith('-')) throw new Error(`Unknown flag: ${a}`);
    if (targetSet) throw new Error(`Unexpected argument: ${a}`);
    args.target = a;
    targetSet = true;
  }
  // Why: --vscode means the extension owns the URL; the CLI must not also
  // launch a browser tab. Implication makes the contract single-sourced.
  if (args.embedMode) args.open = false;
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
  // Fastify assigns the actual port when 0 is passed; we read it from
  // app.server.address() so callers see the real port for ready signals
  // and URL construction.
  if (explicit) {
    try {
      await app.listen({ host: '127.0.0.1', port });
      const addr = app.server.address();
      return typeof addr === 'object' && addr !== null ? addr.port : port;
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
      const addr = app.server.address();
      return typeof addr === 'object' && addr !== null ? addr.port : tryPort;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error('Could not bind a port (tried 10 in a row).');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  // `config` is its own subcommand — never starts a server. Dispatch before
  // arg parsing so the subcommand grammar isn't constrained by the run flags.
  if (argv[0] === 'config') {
    const code = await runConfigSubcommand(argv.slice(1));
    process.exit(code);
  }

  let parsed: ParseResult;
  try {
    parsed = parseArgs(argv);
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

  const app = await createServer({ rootAbsPath, rootInfo, clientDir, paletteOverride: args.palette, embedMode: args.embedMode });
  const boundPort = await listen(app, args.port, args.portExplicit);

  const url =
    rootInfo.rootKind === 'file'
      ? `http://127.0.0.1:${boundPort}/?file=${encodeURIComponent(rootInfo.rootRelPath)}`
      : `http://127.0.0.1:${boundPort}/`;
  if (args.embedMode) {
    // Why: under --vscode the extension parses this JSON to discover the
    // ephemeral port and ready state. Single-line, machine-parseable contract.
    process.stdout.write(JSON.stringify({ event: 'ready', url, port: boundPort }) + '\n');
  } else {
    console.log(`mdview → ${url}`);
    console.log(`watching: ${rootAbsPath}`);
  }

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

  if (args.embedMode) {
    // Why: under --vscode the extension owns this child's stdin pipe. If the
    // extension host crashes the pipe closes (EOF). Shut down cleanly instead
    // of orphaning. Browser-mode invocations leave stdin attached to a terminal
    // and must not touch it. .resume() is necessary because Node otherwise
    // keeps stdin paused and `end`/`error` may not fire until something tries
    // to read.
    process.stdin.on('end', () => { void shutdown(); });
    process.stdin.on('error', () => { void shutdown(); });
    process.stdin.resume();
  }
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

// Only run when invoked as the entry point (e.g. via the bundled bin/mdview.mjs).
// Guards against side effects when this module is imported by tests or other consumers.
// realpathSync resolves the symlink npm install -g creates in /usr/local/bin, so a
// globally-installed mdview still passes the entry-point check.
const isEntryPoint = ((): boolean => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(argv1);
  } catch {
    return false;
  }
})();
if (isEntryPoint) {
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
}
