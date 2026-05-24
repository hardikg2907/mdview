import { render } from 'preact';
import { PALETTES, type Palette } from '../shared/types.js';
import { App } from './App.js';
import { setPalette } from './hooks/usePalette.js';
import { pushPath, setCurrentPath } from './hooks/usePathRouting.js';
import { type IncomingMessage, isEmbedded, onIncoming, postToParent } from './lib/embed.js';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles/reset.css';
import './styles/theme.css';
import './styles/layout.css';
import './styles/content.css';
import './styles/components.css';

// Known inbound message types from the extension. Unknown types are dropped
// silently by the handler — no action needed here.
const KNOWN_INCOMING = new Set([
  'mdview/init',
  'mdview/set-file',
  'mdview/cursor-changed',
  'mdview/palette-changed',
]);

// Defense-in-depth at the client boundary. The server's resolveSafePath is the
// authoritative gate, but we also refuse obvious escape attempts here so a
// malformed inbound never reaches the file loader.
function isSafeRelPath(s: string): boolean {
  if (s.length === 0) return false;
  if (s.startsWith('/')) return false;
  return !s.split('/').some((part) => part === '..');
}

function handleIncoming(msg: IncomingMessage): void {
  if (!KNOWN_INCOMING.has(msg.type)) return;

  switch (msg.type) {
    case 'mdview/init': {
      // Handshake complete — tell the extension the SPA is wired and ready.
      postToParent({ type: 'mdview/ready' });
      break;
    }
    case 'mdview/set-file': {
      const relPath = msg.relPath;
      if (typeof relPath === 'string' && isSafeRelPath(relPath)) {
        // Why: extension-driven file changes must also push the URL so a hard
        // reload keeps the same file and so pushPath's ?embed=vscode
        // preservation applies. Otherwise the SPA re-reads the URL on reload
        // and loses the extension's chosen file.
        setCurrentPath(relPath);
        pushPath(relPath);
      }
      break;
    }
    case 'mdview/cursor-changed': {
      // Scroll the preview to the nearest heading at-or-before `msg.line`.
      // The headings carry `data-source-line` (0-based file line) from commit
      // d8708d6; we find the last heading whose line is ≤ msg.line.
      const line = msg.line;
      if (typeof line !== 'number') break;
      requestAnimationFrame(() => {
        const headings = Array.from(
          document.querySelectorAll<HTMLHeadingElement>(
            '.markdown-content :is(h1,h2,h3,h4,h5,h6)[data-source-line]',
          ),
        );
        let best: HTMLHeadingElement | null = null;
        for (const h of headings) {
          const hLine = parseInt(h.getAttribute('data-source-line') ?? '', 10);
          if (!Number.isNaN(hLine) && hLine <= line) best = h;
        }
        best?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      break;
    }
    case 'mdview/palette-changed': {
      const palette = msg.palette;
      if (typeof palette === 'string' && PALETTES.includes(palette as Palette)) {
        setPalette(palette as Palette);
      }
      break;
    }
  }
}

if (isEmbedded()) {
  onIncoming(handleIncoming);
}

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');
render(<App />, root);
