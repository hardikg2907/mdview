/*
 * Pre-paint theme / palette / wide-layout bootstrap.
 *
 * Loaded as an external script (NOT inline) so it satisfies the strict CSP
 * `script-src 'self'` set by the server. If this ever moves back inline, the
 * CSP must add a matching `'sha256-...'` hash — never `'unsafe-inline'`.
 *
 * Runs synchronously before any CSS or app code, so the first paint already
 * has the right `data-theme` / `data-palette` / `data-wide` on <html>.
 * Defensive everywhere: any failure falls back to OS preference + defaults.
 * Values are validated against fixed allow-lists before being applied.
 */
(function () {
  var THEMES = ['light', 'dark'];
  var PALETTES = ['classic', 'paper', 'nord', 'solarized', 'high-contrast'];
  var theme = null;
  var palette = null;
  var wide = null;
  try {
    var t = localStorage.getItem('mdview-theme');
    if (t && THEMES.indexOf(t) !== -1) theme = t;
    var p = localStorage.getItem('mdview-palette');
    if (p && PALETTES.indexOf(p) !== -1) palette = p;
    var w = localStorage.getItem('mdview-wide-layout');
    if (w === '1') wide = '1';
  } catch (_e) {
    // localStorage blocked (private mode / ITP / cookies disabled).
    // Fall through to defaults.
  }
  if (!theme) {
    try {
      theme =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    } catch (_e) {
      theme = 'light';
    }
  }
  if (!palette) palette = 'classic';
  var root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.palette = palette;
  if (wide === '1') root.dataset.wide = '1';
})();
