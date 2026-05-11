# mdview

A local markdown viewer for reading long, hierarchical docs without losing focus. Run a command, browser opens with a beautifully rendered, navigable view of your file or folder. Edits in your editor show up live. Close terminal to stop.

```
mdview ./docs              # browse a folder
mdview README.md           # view a single file
mdview                     # current directory
```

## Why

Reading long markdown docs is hard:
- You scroll, get distracted, come back, can't find your spot.
- Deep inside a subsection, you forget how it relates to the parent topic.
- AI-generated brainstorming docs grow as you iterate — paste-and-render tools can't keep up.
- Raw markdown without color or rhythm is monotonous over hundreds of lines.

`mdview` is built for that. It's a single-machine, single-user, read-only viewer with editorial typography, persistent navigation, and live reload.

## Install

```bash
git clone <repo>
cd md-to-html
npm install
npm run build
npm install -g .          # puts `mdview` on your PATH
```

Or run from source without global install:

```bash
npm install && npm run build
node bin/mdview.mjs ./docs
```

### Share with friends without publishing

```bash
npm run build && npm pack    # produces mdview-0.2.0.tgz
```

Send them the `.tgz` (Slack/Drive/AirDrop). They install with:

```bash
npm install -g ./mdview-0.2.0.tgz
```

If the repo is on GitHub, they can also skip the tarball:

```bash
npm install -g github:<your-user>/md-to-html
# or one-shot
npx github:<your-user>/md-to-html ./docs
```

The `prepare` script auto-builds on their machine if `bin/` is absent.

## Usage

```bash
mdview <path>              # file or folder
mdview                     # current directory
mdview --port 9000         # custom port (default 7331; auto-fallback unless --port is explicit)
mdview --no-open           # don't auto-launch the browser
mdview --help              # show usage
```

Closes when you `Ctrl-C` or `kill` the process. Set `MDVIEW_DEBUG=1` for full stack traces on unexpected errors.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘P` / `Ctrl+P` | Quick file switcher (fuzzy search) |
| `⌘F` / `Ctrl+F` or `/` | Open in-doc search |
| `⇧⌘F` / `Ctrl+Shift+F` | Open folder-wide search |
| `⌘B` / `Ctrl+B` | Toggle file tree |
| `⌘.` / `Ctrl+.` | Toggle outline |
| `⌘\` / `Ctrl+\` | Toggle theme |
| `j` / `k` | Next / previous heading |
| `gg` / `⇧G` | Top / bottom of document |
| `[` / `]` | Previous / next heading at the same level |
| `⇧H` / `⇧L` | Previous / next file in folder |
| `Ctrl+D` / `Ctrl+U` | Half-page down / up |
| `Alt` / `⌥` + scroll | Fast scroll (~4×) in the main pane |
| `f` / `m` | Toggle focus mode / minimap |
| `Tab` (in search) | Cycle Doc ↔ Folder scope |
| `Enter` / `Shift+Enter` | Next / previous match in search |
| `Esc` | Close search / lightbox / panel |
| `?` | Open shortcuts panel |

Click the keyboard icon in the header anytime to see the full list.

## Features

**Reading**
- 3-pane layout: folder tree, content, outline. Both sidebars collapse to a thin label rail; both have drag handles to resize (widths persist).
- Editorial typography (serif body, italic accent H1, paper-grain background, JetBrains Mono in code blocks).
- Light & dark theme — follows your OS preference, with a manual override that persists.
- Five built-in palettes: classic / paper / nord / solarized / high-contrast. Pick one from the header palette swatch. Code blocks follow the palette (Nord syntax in Nord, Solarized in Solarized, etc.).
- Reading-progress bar pinned to the bottom of the header.
- Doc stats strip below the H1 (reading time, word count, heading count, "Updated N ago").
- Focus mode dims everything except the section at the viewport center.
- Optional minimap rail at the right edge: bars per heading, draggable to scroll, viewport indicator follows.

**Navigation**
- Folder tree sidebar; click any file to load it. Cross-file `[link](other.md)` navigates inside the viewer.
- Outline sidebar with scroll-spy and collapsible nesting. Six toggle pills (`H1`–`H6`) filter which levels show.
- Breadcrumbs in the header reflecting your current viewport heading; click any segment to jump.
- Stable per-heading anchors. Hover any heading to reveal a `#` link that copies a deep-link URL.
- `⌘P` quick file switcher with fuzzy matching across the whole tree.

**Rendering**
- CommonMark + GFM (tables, task lists, strikethrough, autolinks).
- Server-side syntax highlighting via Shiki, palette-aware (10 variants per token — one for every palette/theme combination) — zero client highlighter bundle, no re-render on theme/palette swap.
- Mermaid diagrams, lazy-loaded only when a doc contains a `mermaid` fence.
- Math via KaTeX (`$inline$` and `$$block$$`), lazy-loaded only when a doc contains math.
- Custom-styled task list checkboxes (filled accent when checked, hollow when unchecked).
- Front matter detected and shown as a small collapsible metadata block.
- Inline HTML pass-through (your content, your trust).
- Images render via a safe `/__asset/*` route with relative-path resolution against the file's folder. Click any image to open in a lightbox.
- External links get an `↗` icon and open in a new tab with `noopener noreferrer`.

**Live reload**
- File edits show up instantly. Scroll position and outline collapse state are preserved.

**Search**
- In-doc search highlights all matches; counter shows current position; `Enter`/`Shift+Enter` step through them.
- Folder-wide search greps every markdown file (`⇧⌘F` or the `Folder` toggle); results grouped by file with snippets, click any hit to open that file.
- Three options on the search bar: `Aa` (case-sensitive), `ab` (whole word), `.*` (regex).

**Polish**
- Loading skeleton while files first load.
- Smooth transitions on theme swap, sidebar collapse, outline highlight.
- Copy button on every code block.
- Subtle hover tooltips on every header control.

## Per-project config (`.mdview.json`)

Drop a `.mdview.json` at the folder root to set defaults:

```json
{
  "palette": "nord",
  "fontFamily": "serif",
  "lineWidth": "70ch",
  "defaultCollapsed": { "tree": false, "outline": false }
}
```

All fields optional. Validated on load — invalid values fall back silently with a warning. Edit the file while the server is running and the SPA picks up the change live.

## Stack

Node 20+, TypeScript, Fastify 5, markdown-it 14, Shiki 1, gray-matter, chokidar 4, Preact 10 + @preact/signals, KaTeX 0.16, mermaid 11 (lazy), JetBrains Mono via @fontsource, Vite 6, tsup 8, vitest 2.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the system is put together
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — dev workflow + how to add features
- [`docs/FEATURES.md`](docs/FEATURES.md) — comprehensive feature catalog
- [`TODO.md`](TODO.md) — roadmap (phase 3, phase 4)
- [`VERIFICATION.md`](VERIFICATION.md) — manual verification scenarios

## Tests

```bash
npm test            # vitest, server + client (216 tests)
npm run typecheck   # both tsconfigs
npm run build       # vite (client) + tsup (server CLI)
```

## License

[MIT](LICENSE).
