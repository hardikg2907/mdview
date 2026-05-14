import { globalConfigPath } from './server/config.js';
import {
  addIgnoreEntries,
  listUserIgnoreEntries,
  removeIgnoreEntries,
} from './server/config-write.js';
import { DEFAULT_IGNORED_DIRS } from './shared/ignore.js';

function printConfigUsage(): void {
  console.error(
    `
mdview config — read or edit the global config (${globalConfigPath()})

Subcommands:
  path                       Print the global config file path
  ignore list                Show the built-in skips plus user-added ones
  ignore add <name…>         Append basename(s) to the ignore list
  ignore rm  <name…>         Remove basename(s) from the ignore list

Examples:
  mdview config path
  mdview config ignore add deps _site
  mdview config ignore list

After editing the ignore list, restart any running mdview instance — the file
watcher caches its skip set at startup.
`.trim(),
  );
}

function printIgnoreUsage(): void {
  console.error('Usage: mdview config ignore (list|add|rm) [names…]');
}

export async function runConfigSubcommand(argv: readonly string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (!sub || sub === '-h' || sub === '--help') {
    printConfigUsage();
    return sub ? 0 : 2;
  }

  switch (sub) {
    case 'path':
      console.log(globalConfigPath());
      return 0;
    case 'ignore':
      return runIgnoreSubcommand(rest);
    default:
      console.error(`Unknown subcommand: config ${sub}`);
      printConfigUsage();
      return 2;
  }
}

async function runIgnoreSubcommand(argv: readonly string[]): Promise<number> {
  const [action, ...names] = argv;
  if (!action) {
    printIgnoreUsage();
    return 2;
  }

  switch (action) {
    case 'list': {
      const userList = await listUserIgnoreEntries();
      console.log('Built-in (always skipped):');
      for (const n of DEFAULT_IGNORED_DIRS) console.log(`  ${n}`);
      console.log('Dotfiles / dotdirs are always skipped too (.git, .next, .venv, …).');
      console.log('');
      console.log(`User (${globalConfigPath()}):`);
      if (userList.length === 0) {
        console.log('  (none — run `mdview config ignore add <name>` to add one)');
      } else {
        for (const n of userList) console.log(`  ${n}`);
      }
      return 0;
    }

    case 'add': {
      if (names.length === 0) {
        console.error('mdview config ignore add: expected at least one name');
        return 2;
      }
      try {
        const result = await addIgnoreEntries(names);
        const added = result.after.filter((n) => !result.before.includes(n));
        if (added.length === 0) {
          console.log('Nothing changed — all entries were already in the list.');
        } else {
          console.log(`Added to ${result.path}: ${added.join(', ')}`);
          console.log('Restart mdview for the watcher to pick up the change.');
        }
        return 0;
      } catch (err) {
        console.error((err as Error).message);
        return 2;
      }
    }

    case 'rm':
    case 'remove': {
      if (names.length === 0) {
        console.error('mdview config ignore rm: expected at least one name');
        return 2;
      }
      try {
        const result = await removeIgnoreEntries(names);
        const removed = result.before.filter((n) => !result.after.includes(n));
        if (removed.length === 0) {
          console.log('Nothing changed — none of those names were in the list.');
        } else {
          console.log(`Removed from ${result.path}: ${removed.join(', ')}`);
          console.log('Restart mdview for the watcher to pick up the change.');
        }
        return 0;
      } catch (err) {
        console.error((err as Error).message);
        return 2;
      }
    }

    default:
      printIgnoreUsage();
      return 2;
  }
}
