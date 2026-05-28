import * as vscode from 'vscode';
import { log } from './output';

// process.versions.node is unprefixed (e.g. "20.10.0"); a leading 'v' indicates
// malformed input and is rejected so callers can surface it.
export function isSupportedNodeVersion(version: string): boolean {
  const major = parseInt(version.split('.')[0] || '0', 10);
  return Number.isFinite(major) && major >= 20;
}

export function probeAndNotify(): boolean {
  const v = process.versions.node;
  if (isSupportedNodeVersion(v)) return true;
  const msg = `mdview requires Node 20+. VS Code is running with Node ${v}.`;
  log(msg);
  vscode.window.showErrorMessage?.(msg);
  return false;
}
