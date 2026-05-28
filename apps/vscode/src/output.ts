import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getOutput(): vscode.OutputChannel {
  if (!channel) channel = vscode.window.createOutputChannel('mdview');
  return channel;
}

export function log(message: string): void {
  getOutput().appendLine(`[${new Date().toISOString()}] ${message}`);
}

// Dead-stripped in production: NODE_ENV is substituted at bundle time.
export function __resetForTests(): void {
  if (process.env.NODE_ENV === 'development') channel = undefined;
}
