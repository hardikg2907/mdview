import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSSE } from '../../src/client/hooks/useSSE.js';
import type { WatchEvent } from '../../src/shared/types.js';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  closed = false;
  private listeners = new Map<string, Array<(m: MessageEvent<string>) => void>>();

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: (m: MessageEvent<string>) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn({ data } as MessageEvent<string>);
  }
}

function Probe({ onEvent }: { onEvent: (e: WatchEvent) => void }) {
  useSSE(onEvent);
  return null;
}

describe('useSSE', () => {
  let host: HTMLElement;

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    render(null, host);
    host.remove();
    vi.unstubAllGlobals();
  });

  it('keeps one connection when the handler changes and delivers to the newest handler', async () => {
    const first = vi.fn();
    const second = vi.fn();

    await act(() => render(h(Probe, { onEvent: first }), host));
    await act(() => render(h(Probe, { onEvent: second }), host));

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]?.closed).toBe(false);

    FakeEventSource.instances[0]?.emit('change', JSON.stringify({ kind: 'change', relPath: 'a.md' }));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ kind: 'change', relPath: 'a.md' });
  });

  it('closes the connection on unmount', async () => {
    await act(() => render(h(Probe, { onEvent: vi.fn() }), host));
    await act(() => render(null, host));

    expect(FakeEventSource.instances[0]?.closed).toBe(true);
  });

  it('ignores a malformed payload', async () => {
    const onEvent = vi.fn();
    await act(() => render(h(Probe, { onEvent }), host));

    FakeEventSource.instances[0]?.emit('add', '{not json');

    expect(onEvent).not.toHaveBeenCalled();
  });
});
