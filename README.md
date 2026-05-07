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

## Usage

```bash
mdview <path>              # file or folder
mdview                     # current directory
mdview --port 9000         # custom port (default 7331; auto-fallback on conflict)
mdview --no-open           # don't auto-launch the browser
mdview --help              # show usage
```

Closes when you `Ctrl-C` or `kill` the process.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘P` / `Ctrl+P` | Quick file switcher (fuzzy search) |
| `⌘F` / `Ctrl+F` or `/` | Open in-doc search |
| `⌘B` / `Ctrl+B` | Toggle file tree |
| `⌘.` / `Ctrl+.` | Toggle outline |
| `⌘\` / `Ctrl+\` | Toggle theme |
| `j` / `k` | Next / previous heading |
| `Enter` / `Shift+Enter` | Next / previous match in search |
| `Esc` | Close search / lightbox / panel |
| `?` | Open shortcuts panel |

Click the keyboard icon in the header anytime to see the full list.

## Features

**Reading**
- 3-pane layout: folder tree, content, outline. Both sidebars collapse to a thin label rail.
- Editorial typography (serif body, italic accent H1, paper-grain background).
- Light & dark theme — follows your OS preference, with a manual override that persists.
- Reading-progress bar pinned to the bottom of the header.
- Doc stats strip below the H1 (reading time, word count, heading count).

**Navigation**
- Folder tree sidebar; click any file to load it. Cross-file `[link](other.md)` navigates inside the viewer.
- Outline sidebar with scroll-spy and collapsible nesting. Click any item to jump.
- Breadcrumbs in the header reflecting your current viewport heading; click any segment to jump.
- Stable per-heading anchors. Hover any heading to reveal a `#` link that copies a deep-link URL.
- `⌘P` quick file switcher with fuzzy matching across the whole tree.

**Rendering**
- CommonMark + GFM (tables, task lists, strikethrough, autolinks).
- Server-side syntax highlighting via Shiki, dual-theme — zero client highlighter bundle.
- Mermaid diagrams, lazy-loaded only when a doc contains a `mermaid` fence.
- Custom-styled task list checkboxes (filled accent when checked, hollow when unchecked).
- Front matter detected and shown as a small collapsible metadata block.
- Inline HTML pass-through (your content, your trust).
- Images render via a safe `/__asset/*` route with relative-path resolution against the file's folder. Click any image to open in a lightbox.
- External links get an `↗` icon and open in a new tab with `noopener noreferrer`.

**Live reload**
- File edits show up instantly. Scroll position and outline collapse state are preserved.

**Search**
- In-doc search highlights all matches; counter shows current position; `Enter`/`Shift+Enter` step through them.

**Polish**
- Loading skeleton while files first load.
- Smooth transitions on theme swap, sidebar collapse, outline highlight.
- Copy button on every code block.

## Stack

Node 20+, TypeScript, Fastify 5, markdown-it 14, Shiki 1, gray-matter, chokidar 4, Preact 10 + @preact/signals, Vite 6, tsup 8, vitest 2.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the system is put together
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — dev workflow + how to add features
- [`docs/FEATURES.md`](docs/FEATURES.md) — comprehensive feature catalog
- [`TODO.md`](TODO.md) — roadmap (phase 2, 3, 4)
- [`VERIFICATION.md`](VERIFICATION.md) — manual verification scenarios

## Tests

```bash
npm test            # vitest, server + client
npm run typecheck   # both tsconfigs
npm run build       # vite (client) + tsup (server CLI)
```

## License

Personal project. No license declared.
