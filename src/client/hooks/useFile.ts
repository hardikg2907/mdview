import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { RenderedFile } from '../../shared/types.js';
import { paletteSignal } from './usePalette.js';

export const fileSignal = signal<RenderedFile | null>(null);
export const fileError = signal<string | null>(null);
export const fileLoading = signal(false);

export async function loadFile(relPath: string | null): Promise<void> {
  fileLoading.value = true;
  fileError.value = null;
  try {
    // The palette is read here rather than passed in so every caller — the
    // route effect, live reload — sends the active one without having to
    // know about it. The server renders that palette's code colours only.
    const q = new URLSearchParams({ palette: paletteSignal.value });
    if (relPath) q.set('path', relPath);
    const url = `/api/file?${q}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    fileSignal.value = (await res.json()) as RenderedFile;
  } catch (err) {
    fileError.value = (err as Error).message;
    fileSignal.value = null;
  } finally {
    fileLoading.value = false;
  }
}

export function useFile(relPath: string | null) {
  useEffect(() => {
    void loadFile(relPath);
  }, [relPath]);
  return { file: fileSignal.value, error: fileError.value, loading: fileLoading.value };
}
