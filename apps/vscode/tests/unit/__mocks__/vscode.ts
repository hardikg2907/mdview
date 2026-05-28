import { EventEmitter as NodeEventEmitter } from 'node:events';

export enum ColorThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3,
  HighContrastLight = 4,
}

// ---------------------------------------------------------------------------
// Disposable
// ---------------------------------------------------------------------------

export class Disposable {
  constructor(private readonly fn?: () => void) {}
  dispose(): void {
    this.fn?.();
  }
  static from(...disposables: { dispose(): void }[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) d.dispose();
    });
  }
}

// ---------------------------------------------------------------------------
// EventEmitter (vscode.EventEmitter<T>)
// ---------------------------------------------------------------------------

export class EventEmitter<T = void> {
  private readonly emitter = new NodeEventEmitter();
  private readonly EVENT = 'e';

  get event(): (handler: (data: T) => void) => Disposable {
    return (handler: (data: T) => void) => {
      this.emitter.on(this.EVENT, handler);
      return new Disposable(() => this.emitter.off(this.EVENT, handler));
    };
  }

  fire(data: T): void {
    this.emitter.emit(this.EVENT, data);
  }

  dispose(): void {
    this.emitter.removeAllListeners();
  }
}

// ---------------------------------------------------------------------------
// Workspace configuration
// ---------------------------------------------------------------------------

const configStore: Record<string, unknown> = {};

export const workspace = {
  getConfiguration: (_section: string, _scope?: unknown) => ({
    get: <T>(key: string, defaultValue: T): T => {
      const composite = _section ? `${_section}.${key}` : key;
      return (configStore[composite] as T) ?? defaultValue;
    },
  }),
  // expose a test helper to seed the mock store
  __setConfig: (key: string, value: unknown): void => {
    configStore[key] = value;
  },
  __resetConfig: (): void => {
    for (const k of Object.keys(configStore)) delete configStore[k];
  },
};

// ---------------------------------------------------------------------------
// MockWebviewPanel
// ---------------------------------------------------------------------------

export interface MockWebview {
  html: string;
  cspSource: string;
  postMessage: (msg: unknown) => Promise<boolean>;
  onDidReceiveMessage: (handler: (msg: unknown) => void) => Disposable;
  // Test helper: simulate a message arriving from the webview.
  __receiveMessage: (msg: unknown) => void;
}

export interface MockPanel {
  webview: MockWebview;
  onDidDispose: (handler: () => void) => Disposable;
  dispose: () => void;
  reveal: (column?: unknown) => void;
  // Test helper: simulate the panel being closed.
  __fireDispose: () => void;
}

function makeMockPanel(): MockPanel {
  const receiveHandlers: Array<(msg: unknown) => void> = [];
  const disposeHandlers: Array<() => void> = [];

  const webview: MockWebview = {
    html: '',
    cspSource: 'https://mock.vscode-cdn.net',
    postMessage: (_msg: unknown) => Promise.resolve(true),
    onDidReceiveMessage: (handler) => {
      receiveHandlers.push(handler);
      return new Disposable(() => {
        const idx = receiveHandlers.indexOf(handler);
        if (idx >= 0) receiveHandlers.splice(idx, 1);
      });
    },
    __receiveMessage: (msg: unknown) => {
      for (const h of receiveHandlers) h(msg);
    },
  };

  return {
    webview,
    onDidDispose: (handler) => {
      disposeHandlers.push(handler);
      return new Disposable(() => {
        const idx = disposeHandlers.indexOf(handler);
        if (idx >= 0) disposeHandlers.splice(idx, 1);
      });
    },
    dispose: () => {
      for (const h of disposeHandlers) h();
    },
    reveal: (_column?: unknown) => {},
    __fireDispose: () => {
      for (const h of disposeHandlers) h();
    },
  };
}

export const ViewColumn = {
  Active: 1,
  Beside: 2,
  One: 1,
} as const;

export const window = {
  createOutputChannel: (name: string) => ({
    name,
    appendLine: (_m: string): void => {},
    append: (_m: string): void => {},
    show: (): void => {},
    dispose: (): void => {},
  }),
  createWebviewPanel: (
    _viewType: string,
    _title: string,
    _showOptions: unknown,
    _options: unknown,
  ): MockPanel => {
    return makeMockPanel();
  },
};

export const Uri = {
  file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
};
