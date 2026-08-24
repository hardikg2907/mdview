import dns from 'node:dns/promises';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import openBrowser from 'open';
import { runConfigSubcommand } from './cli-config.js';
import { createServer } from './server/index.js';
import { deriveRootId, type RootSpec } from './server/workspace.js';
import { PALETTES, type Palette } from './shared/types.js';

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

Environment:
  PORT                     Default port when --port is omitted
  MDVIEW_DEBUG=1           Print full stack traces on unexpected errors

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

export const DEFAULT_PORT = 7331;

/**
 * A name is nicer to type and remember than a loopback IP, and `*.localhost` is
 * reserved to loopback by RFC 6761 — browsers resolve it without any setup and
 * without touching /etc/hosts. The server still binds 127.0.0.1 only; this
 * changes the URL we print and open, not what we listen on.
 */
const FRIENDLY_HOST = 'mdview.localhost';

function isLoopbackAddress(addr: string): boolean {
  return addr === '::1' || addr.startsWith('127.');
}

/**
 * Resolve the hostname to show the user, falling back to the literal loopback
 * address when the friendly name can't be trusted.
 *
 * `every` rather than `some` is the point: a resolver that answers
 * `mdview.localhost` with a routable address (a wildcard DNS hijack, a
 * corporate split-horizon zone) must not be handed a URL, because the browser
 * would then send the request off this machine. Falling back costs nothing.
 */
async function resolveDisplayHost(): Promise<string> {
  try {
    const addrs = await dns.lookup(FRIENDLY_HOST, { all: true });
    if (addrs.length > 0 && addrs.every((a) => isLoopbackAddress(a.address))) {
      return FRIENDLY_HOST;
    }
  } catch {
    // No such name on this resolver (some musl/Alpine and locked-down setups).
  }
  return '127.0.0.1';
}

/**
 * PORT is the near-universal convention for "listen here", and it is what a
 * local reverse proxy such as portless injects when it runs mdview as a child
 * to give it a port-free URL of its own. Junk values are ignored rather than
 * fatal — PORT is often exported for an unrelated project, and refusing to
 * start would be worse than using the default.
 */
function envPort(): number | undefined {
  const raw = process.env.PORT;
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65535) return undefined;
  return n;
}

export function parseArgs(argv: string[], defaultPort: number = DEFAULT_PORT): ParseResult {
  const args: Args = { target: '.', port: defaultPort, portExplicit: false, open: true, embedMode: false };
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

/**
 * Turn a CLI target into a root spec. The id is assigned here rather than left
 * to the server because the URL we print and open has to contain it.
 */
function detectRoot(target: string): RootSpec {
  const abs = path.resolve(target);
  if (!existsSync(abs)) throw new Error(`Path does not exist: ${abs}`);
  const st = statSync(abs);
  if (st.isDirectory()) {
    return { absPath: abs, id: deriveRootId(abs, new Set()), kind: 'dir' };
  }
  if (st.isFile()) {
    const dir = path.dirname(abs);
    return {
      absPath: dir,
      id: deriveRootId(dir, new Set()),
      name: path.basename(abs),
      kind: 'file',
      filePath: path.basename(abs),
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
    parsed = parseArgs(argv, envPort() ?? DEFAULT_PORT);
  } catch (err) {
    console.error((err as Error).message);
    printUsage();
    process.exit(2);
  }
  if (parsed.kind === 'help') { printUsage(); process.exit(0); }
  if (parsed.kind === 'version') { console.log(readVersion()); process.exit(0); }
  const args = parsed.args;

  const root = detectRoot(args.target);

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

  const app = await createServer({ roots: [root], clientDir, paletteOverride: args.palette, embedMode: args.embedMode });
  const boundPort = await listen(app, args.port, args.portExplicit);

  // Embed mode stays on the literal address: the extension reconstructs the
  // expected prefix from the port it was given and rejects the handshake if the
  // URL doesn't match, so a friendly hostname there would break the contract.
  const host = args.embedMode ? '127.0.0.1' : await resolveDisplayHost();
  const url =
    root.kind === 'file'
      ? `http://${host}:${boundPort}/?file=${encodeURIComponent(`${root.id}/${root.filePath}`)}`
      : `http://${host}:${boundPort}/`;
  if (args.embedMode) {
    // Why: under --vscode the extension parses this JSON to discover the
    // ephemeral port and ready state. Single-line, machine-parseable contract.
    process.stdout.write(JSON.stringify({ event: 'ready', url, port: boundPort }) + '\n');
  } else {
    console.log(`mdview → ${url}`);
    console.log(`watching: ${root.absPath}`);
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
