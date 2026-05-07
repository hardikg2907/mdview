import katex from 'katex';

/**
 * Replace `<span class="math-inline" data-source="...">` and
 * `<div class="math-block" data-source="...">` placeholders with their
 * KaTeX-rendered HTML. Used during static export so the output is fully
 * static and works without JavaScript.
 */
export function renderMathServerSide(html: string): string {
  let out = html;

  // Inline math
  out = out.replace(
    /<span class="math-inline" data-source="([^"]*)"[^>]*><\/span>/g,
    (_match, encoded) => {
      try {
        const src = decodeURIComponent(encoded);
        return katex.renderToString(src, {
          displayMode: false,
          throwOnError: false,
          output: 'html',
        });
      } catch {
        return _match;
      }
    },
  );

  // Block math
  out = out.replace(
    /<div class="math-block" data-source="([^"]*)"[^>]*><\/div>/g,
    (_match, encoded) => {
      try {
        const src = decodeURIComponent(encoded);
        const inner = katex.renderToString(src, {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        });
        return `<div class="math-block">${inner}</div>`;
      } catch {
        return _match;
      }
    },
  );

  return out;
}
