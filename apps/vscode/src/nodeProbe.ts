import * as vscode from 'vscode';
import { log } from './output';

// process.versions.node is unprefixed (e.g. "22.15.1"); a leading 'v' indicates
// malformed input and is rejected so callers can surface it.
// 22.12 is the first 22.x that loads an ES module through require() without a
// flag, and a dependency of the CLI relies on that.
export function isSupportedNodeVersion(version: string): boolean {
  const [major, minor] = version.split('.').map((part) => parseInt(part || '0', 10));
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  return (major as number) > 22 || (major === 22 && (minor as number) >= 12);
}

export function probeAndNotify(): boolean {
  const v = process.versions.node;
  if (isSupportedNodeVersion(v)) return true;
  const msg = `mdview requires Node 22.12 or later. VS Code is running with Node ${v}.`;
  log(msg);
  vscode.window.showErrorMessage?.(msg);
  return false;
}
