import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { createPersistedString } from '../lib/persisted-signal.js';
import { configSignal } from './useTree.js';
import { PALETTES, type Palette } from '../../shared/types.js';

const STORAGE_KEY = 'mdview-palette';

function readStored(): Palette | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && PALETTES.includes(v as Palette)) return v as Palette;
  } catch {
    // unavailable
  }
  return null;
}

const initialStored = readStored();
const persisted = createPersistedString<Palette>(
  STORAGE_KEY,
  initialStored ?? 'classic',
  PALETTES,
);

export const paletteSignal = persisted.signal;
/**
 * True if the user has explicitly chosen a palette this session — overrides
 * the per-project `.mdview.json` palette.
 */
export const paletteUserOverride = signal<boolean>(initialStored !== null);

export function setPalette(p: Palette): void {
  persisted.set(p);
  paletteUserOverride.value = true;
}

/**
 * Apply `data-palette` to <html> for CSS theming. Resolution order:
 *   1. Explicit user override (localStorage) wins.
 *   2. Otherwise, the project config's palette (if any) is used.
 *   3. Otherwise, fall back to whatever's stored (default 'classic').
 */
export function usePalette(): Palette {
  useEffect(() => {
    if (!paletteUserOverride.value && configSignal.value?.palette) {
      paletteSignal.value = configSignal.value.palette;
    }
  });

  useEffect(() => {
    document.documentElement.dataset.palette = paletteSignal.value;
  });

  return paletteSignal.value;
}
