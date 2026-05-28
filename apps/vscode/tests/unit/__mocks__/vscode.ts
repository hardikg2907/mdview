export enum ColorThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3,
  HighContrastLight = 4,
}

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

export const window = {
  createOutputChannel: (name: string) => ({
    name,
    appendLine: (_m: string): void => {},
    append: (_m: string): void => {},
    show: (): void => {},
    dispose: (): void => {},
  }),
};

export const Uri = {
  file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
};
