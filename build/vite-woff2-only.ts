import type { Plugin } from 'vite';

/**
 * Drops the woff and ttf fallbacks from every `@font-face` source list.
 *
 * Every browser mdview targets (current Chromium, Firefox and Safari, and VS
 * Code's webview) loads woff2, so the other two formats are never requested.
 * They were most of the font weight in the published tarball: KaTeX ships
 * woff2, woff and ttf for each face, JetBrains Mono ships woff2 and woff.
 *
 * This rewrites the CSS text before Vite's own CSS pipeline sees it. A PostCSS
 * plugin is too late: Vite resolves and emits every `url()` asset before user
 * PostCSS plugins run, so the files would still be copied to the output.
 */

/** Splits on commas that are not inside parentheses, so `url(a,b)` stays whole. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

const WOFF2_FORMAT = /format\(\s*["']?woff2["']?\s*\)/i;

/**
 * Returns the source list reduced to its woff2 entries. A list with no woff2
 * entry is returned untouched: an extra file is better than a face with no
 * source at all.
 */
export function woff2Sources(value: string): string {
  const kept = splitTopLevel(value).filter((entry) => WOFF2_FORMAT.test(entry));
  return kept.length > 0 ? kept.join(', ') : value;
}

/** Rewrites the `src` descriptor of every `@font-face` block in a stylesheet. */
export function keepWoff2InCss(css: string): string {
  return css.replace(/@font-face\s*\{[^}]*\}/g, (block) =>
    block.replace(/(\bsrc\s*:\s*)([^;}]+)/, (_m, prop: string, value: string) => {
      return `${prop}${woff2Sources(value)}`;
    }),
  );
}

export function woff2OnlyFonts(): Plugin {
  return {
    name: 'mdview-woff2-only-fonts',
    enforce: 'pre',
    transform(code, id) {
      if (!/\.css(?:$|\?)/.test(id)) return null;
      const out = keepWoff2InCss(code);
      return out === code ? null : { code: out, map: null };
    },
  };
}
