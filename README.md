# mdview

Local markdown viewer with live reload, outline navigation, and folder browsing.

## Install

```bash
npm install -g mdview
# or use npx:
npx mdview ./docs
```

## Usage

```bash
mdview <path>          # File or folder
mdview                 # Current directory
mdview --port 9000     # Custom port
mdview --no-open       # Don't auto-launch the browser
```

## Features

- 3-pane layout: folder tree, content, collapsible outline
- Persistent outline with scroll-spy + breadcrumbs
- Live reload (preserves scroll position)
- Cross-file `[link](other.md)` navigation
- Light + dark themes following OS preference
- Server-side syntax highlighting (Shiki, dual-theme)
- Mermaid diagrams (lazy-loaded)

## Build from source

```bash
npm install
npm run build
node bin/mdview.mjs <path>
```

## Stack

Node 20+, TypeScript, Fastify, markdown-it, Shiki, Preact, Vite, chokidar.

## Tests

```bash
npm test
```
