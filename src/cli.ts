import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from './server/index.js';
import openBrowser from 'open';
import type { RootInfo } from './shared/types.js';

function printUsage(): void {
  console.error(`
mdview — local markdown viewer

Usage:
  mdview [path]                  View file or folder (default: cwd)
  mdview export <out> [path]     Export folder as static HTML to <out>

Options:
  --port <n>                     Port to listen on (default: 7331; auto-fallback)
  --no-open                      Don't auto-launch the browser
  --help, -h                     Show this help

Examples:
  mdview ./docs                  Browse a folder
  mdview README.md               View a single file
  mdview --port 9000             Use a specific port
  mdview export ./out ./docs     Build a static bundle to ./out
`.trim());
}

interface ServerArgs {
  mode: 'serve';
  target: string;
  port: number;
  open: boolean;
}

interface ExportArgs {
  mode: 'export';
  target: string;
  outDir: string;
}

type Args = ServerArgs | ExportArgs;

function parseArgs(argv: string[]): Args | null {
  if (argv.length > 0 && (argv[0] === '-h' || argv[0] === '--help')) return null;

  if (argv[0] === 'export') {
    const positional: string[] = [];
    for (let i = 1; i < argv.length; i++) {
      const a = argv[i]!;
      if (a === '-h' || a === '--help') return null;
      if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
      positional.push(a);
    }
    if (positional.length < 1) throw new Error('mdview export: missing <out> argument');
    return {
      mode: 'export',
      outDir: positional[0]!,
      target: positional[1] ?? '.',
    };
  }

  const args: ServerArgs = { mode: 'serve', target: '.', port: 7331, open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h' || a === '--help') return null;
    if (a === '--no-open') { args.open = false; continue; }
    if (a === '--port') {
      const v = argv[++i];
      if (!v) throw new Error('--port requires a number');
      args.port = Number(v);
      if (!Number.isInteger(args.port) || args.port <= 0) throw new Error('Invalid --port');
      continue;
    }
    if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    args.target = a;
  }
  return args;
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

async function listen(app: Awaited<ReturnType<typeof createServer>>, port: number): Promise<number> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await app.listen({ host: '127.0.0.1', port: port + attempt });
      return port + attempt;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error('Could not bind a port (tried 10 in a row).');
}

function locateClientDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../dist/client'),
    path.resolve(here, '../../dist/client'),
  ];
  const dir = candidates.find(existsSync);
  if (!dir) {
    console.error('Client bundle not found. Run `npm run build:client` first.');
    process.exit(1);
  }
  return dir;
}

async function runServer(args: ServerArgs): Promise<void> {
  const { rootAbsPath, rootInfo } = detectRoot(args.target);
  const clientDir = locateClientDir();
  const app = await createServer({ rootAbsPath, rootInfo, clientDir, port: args.port });
  const boundPort = await listen(app, args.port);

  const url =
    rootInfo.rootKind === 'file'
      ? `http://127.0.0.1:${boundPort}/?file=${encodeURIComponent(rootInfo.rootRelPath)}`
      : `http://127.0.0.1:${boundPort}/`;
  console.log(`mdview → ${url}`);
  console.log(`watching: ${rootAbsPath}`);

  if (args.open) await openBrowser(url);

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function runExportMain(args: ExportArgs): Promise<void> {
  const { rootAbsPath, rootInfo } = detectRoot(args.target);
  if (rootInfo.rootKind !== 'dir') {
    throw new Error('mdview export requires a directory target');
  }
  const clientDir = locateClientDir();
  const outAbs = path.resolve(args.outDir);
  // Lazy import: keeps katex (used by export) out of the server's hot bundle.
  const { runExport } = await import('./export/index.js');
  await runExport({ rootAbsPath, rootInfo, clientDir, outDir: outAbs });
  console.log(`mdview → static bundle written to ${outAbs}`);
}

async function main(): Promise<void> {
  let args: Args | null;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    printUsage();
    process.exit(2);
  }
  if (!args) { printUsage(); process.exit(0); }

  if (args.mode === 'export') {
    await runExportMain(args);
  } else {
    await runServer(args);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
