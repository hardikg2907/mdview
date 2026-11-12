import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearFile, fileSignal, loadFile } from '../../src/client/hooks/useFile.js';
import { useLiveReload } from '../../src/client/hooks/useLiveReload.js';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  private listeners = new Map<string, Array<(m: MessageEvent<string>) => void>>();

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (m: MessageEvent<string>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  close(): void {}

  emit(type: string, payload: object): void {
    for (const fn of this.listeners.get(type) ?? []) {
      fn({ data: JSON.stringify(payload) } as MessageEvent<string>);
    }
  }
}

function Probe() {
  useLiveReload({ currentPath: null, scrollerRef: { current: null } });
  return null;
}

describe('useLiveReload tree refresh', () => {
  let host: HTMLElement;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ roots: [], tree: [], config: null }),
    }));
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('fetch', fetchMock);
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    render(null, host);
    host.remove();
    clearFile();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('turns a burst of add/unlink events into a single tree fetch', async () => {
    await act(() => render(h(Probe, {}), host));
    const es = FakeEventSource.instances[0]!;

    for (let i = 0; i < 200; i++) {
      es.emit(i % 2 === 0 ? 'add' : 'unlink', { kind: i % 2 === 0 ? 'add' : 'unlink', relPath: `r/${i}.md` });
    }
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(150);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/tree', { headers: {} });
  });

  it('does not refetch after unmount', async () => {
    await act(() => render(h(Probe, {}), host));
    FakeEventSource.instances[0]!.emit('add', { kind: 'add', relPath: 'r/a.md' });

    await act(() => render(null, host));
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts an older slow loadFile so a newer navigation wins', async () => {
    let resolveSlow!: (v: unknown) => void;
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        if (url.includes('slow.md')) {
          return new Promise((r) => {
            resolveSlow = r;
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            relPath: 'r/fast.md',
            html: '<p>fast</p>',
            outline: [],
            frontmatter: null,
            title: 'Fast',
            lastModified: 2,
          }),
        });
      }),
    );

    const pSlow = loadFile('r/slow.md');
    const pFast = loadFile('r/fast.md');
    expect(signals[0]?.aborted).toBe(true);

    await pFast;
    expect(fileSignal.value?.relPath).toBe('r/fast.md');

    resolveSlow({
      ok: true,
      json: async () => ({
        relPath: 'r/slow.md',
        html: '<p>slow</p>',
        outline: [],
        frontmatter: null,
        title: 'Slow',
        lastModified: 1,
      }),
    });
    await pSlow;
    expect(fileSignal.value?.relPath).toBe('r/fast.md');
  });
});
