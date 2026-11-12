import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { RenderedFile } from '../../shared/types.js';
import { apiHeaders } from '../lib/embed.js';
import { paletteSignal } from './usePalette.js';

export const fileSignal = signal<RenderedFile | null>(null);
export const fileError = signal<string | null>(null);
export const fileLoading = signal(false);

let activeRequestId = 0;
let activeController: AbortController | null = null;

export function clearFile(): void {
  activeRequestId++;
  activeController?.abort();
  activeController = null;
  fileSignal.value = null;
  fileError.value = null;
  fileLoading.value = false;
}

export async function loadFile(relPath: string | null): Promise<void> {
  activeController?.abort();
  const ctl = new AbortController();
  activeController = ctl;
  const reqId = ++activeRequestId;

  fileLoading.value = true;
  fileError.value = null;
  try {
    // The palette is read here rather than passed in so every caller — the
    // route effect, live reload — sends the active one without having to
    // know about it. The server renders that palette's code colours only.
    const q = new URLSearchParams({ palette: paletteSignal.value });
    if (relPath) q.set('path', relPath);
    const url = `/api/file?${q}`;
    const res = await fetch(url, { headers: apiHeaders(), signal: ctl.signal });
    if (reqId !== activeRequestId) return;
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (reqId !== activeRequestId) return;
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const rendered = (await res.json()) as RenderedFile;
    if (reqId !== activeRequestId) return;
    fileSignal.value = rendered;
  } catch (err) {
    if ((err as Error)?.name === 'AbortError' || reqId !== activeRequestId) return;
    fileError.value = (err as Error).message;
    fileSignal.value = null;
  } finally {
    if (reqId === activeRequestId) {
      activeController = null;
      fileLoading.value = false;
    }
  }
}

export function useFile(relPath: string | null) {
  useEffect(() => {
    void loadFile(relPath);
  }, [relPath]);
  return { file: fileSignal.value, error: fileError.value, loading: fileLoading.value };
}
