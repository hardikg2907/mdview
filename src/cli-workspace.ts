import { findLiveDaemon, stopDaemon } from './daemon/client.js';
import { daemonLogPath } from './daemon/state.js';
import { MAX_ROOTS, readWorkspace, removeRoot } from './daemon/workspace-file.js';

/** Shorten a path under the home directory for display. */
function tilde(abs: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  return home && abs.startsWith(home) ? `~${abs.slice(home.length)}` : abs;
}

export async function runListCommand(): Promise<number> {
  const { roots } = readWorkspace();
  const live = await findLiveDaemon();

  if (roots.length === 0) {
    console.log('No folders open. Run `mdview <path>` to add one.');
  } else {
    const open = new Set(live?.health.roots ?? []);
    const idWidth = Math.max(...roots.map((r) => r.id.length));
    for (const [i, r] of roots.entries()) {
      // A root listed here but not reported by the daemon is one it hasn't
      // picked up yet, or couldn't open.
      const mark = live ? (open.has(r.id) ? '●' : '○') : ' ';
      const label = i === 0 ? '  (primary)' : '';
      const suffix = r.kind === 'file' ? `  → ${r.filePath}` : '';
      console.log(`${mark} ${r.id.padEnd(idWidth)}  ${tilde(r.path)}${suffix}${label}`);
    }
    if (roots.length >= MAX_ROOTS) {
      console.log(`\nWorkspace is full (${MAX_ROOTS}). Remove one with \`mdview rm <name>\`.`);
    }
  }

  console.log('');
  if (live) {
    console.log(`server:  http://mdview.localhost:${live.state.port}/  (pid ${live.state.pid})`);
    console.log(`logs:    ${daemonLogPath()}`);
  } else {
    console.log('server:  not running — the next `mdview <path>` will start it');
  }
  return 0;
}

export async function runRemoveCommand(argv: readonly string[]): Promise<number> {
  const targets = argv.filter((a) => !a.startsWith('-'));
  if (targets.length === 0) {
    console.error('Usage: mdview rm <name|path>…');
    return 2;
  }
  let removedAny = false;
  for (const target of targets) {
    const removed = removeRoot(target);
    if (removed) {
      removedAny = true;
      console.log(`Removed ${removed.id} (${tilde(removed.path)})`);
    } else {
      console.error(`Not open: ${target}`);
    }
  }
  if (!removedAny) return 2;
  // The daemon watches the workspace file, so open tabs update themselves; no
  // need to make the user restart anything.
  console.log('Open tabs will update on their own.');
  return 0;
}

export async function runStopCommand(): Promise<number> {
  const outcome = await stopDaemon();
  switch (outcome.kind) {
    case 'stopped':
      console.log(`mdview: stopped (pid ${outcome.pid})`);
      return 0;
    case 'not-running':
      console.log('mdview: not running');
      return 0;
    case 'stale':
      console.log('mdview: not running (cleared a stale record)');
      return 0;
  }
}
