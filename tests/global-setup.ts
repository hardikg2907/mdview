import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

// Several test files spawn bin/mdview.mjs. Building once here, before any file
// runs, keeps one file from spawning the bin while another rewrites its chunks.
export default function setup(): void {
  execSync('npm run build', { cwd: resolve(import.meta.dirname, '..'), stdio: 'inherit' });
}
