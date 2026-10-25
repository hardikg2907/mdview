import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The package version, read from package.json. Every consumer (--version, the
 * daemon's health report, `mdview update`) goes through this one function, so
 * they cannot disagree about which build is running.
 */
export function readVersion(): string {
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
