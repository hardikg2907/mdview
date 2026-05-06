# Markdown Viewer (`mdview`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local CLI markdown viewer (`mdview`) that renders an md file or folder in a navigable 3-pane single-page application with live reload, per the approved product spec.

**Architecture:** Node.js CLI boots a local Fastify HTTP server and opens the default browser to a Preact SPA. The server parses markdown with markdown-it + Shiki (server-side syntax highlighting → no client highlighter bundle), watches the path via chokidar, and pushes change events through Server-Sent Events. The frontend is a 3-pane layout (folder tree | content | outline) that fetches rendered HTML + outline metadata via JSON API and refreshes content in place on SSE events to preserve scroll & outline state.

**Tech Stack:**
- Runtime: Node.js 20+, TypeScript 5.4+
- Server: Fastify 5 + @fastify/static
- Markdown: markdown-it 14 (+ markdown-it-task-lists, markdown-it-anchor)
- Syntax highlighting: Shiki 1 (server-side, dual light/dark theme)
- Frontmatter: gray-matter 4
- File watching: chokidar 4
- Frontend: Preact 10 + @preact/signals + Wouter (router)
- Mermaid: mermaid 11 (dynamic import on demand)
- Bundler: Vite 6 (frontend) + tsup 8 (server/cli)
- Test runner: vitest 2 + happy-dom
- Distribution: npm package; binary via `bin` field

---

## File Structure

```
md-to-html/
├── package.json
├── tsconfig.json
├── tsconfig.client.json
├── vite.config.ts
├── tsup.config.ts
├── vitest.config.ts
├── .gitignore
├── README.md
├── bin/
│   └── mdview.mjs                    # Compiled CLI entry (built from src/cli.ts)
├── src/
│   ├── cli.ts                        # CLI entry: parse args, boot server, open browser
│   ├── shared/
│   │   └── types.ts                  # Shared types between server & client
│   ├── server/
│   │   ├── index.ts                  # createServer(): builds Fastify app, returns it
│   │   ├── routes/
│   │   │   ├── api-file.ts           # GET /api/file?path=...
│   │   │   ├── api-tree.ts           # GET /api/tree
│   │   │   └── sse.ts                # GET /api/watch (SSE)
│   │   ├── render/
│   │   │   ├── markdown.ts           # markdown-it instance + render(md, opts)
│   │   │   ├── shiki.ts              # Shiki highlighter, hooked into markdown-it
│   │   │   ├── outline.ts            # extractOutline(html|tokens) → OutlineNode[]
│   │   │   ├── frontmatter.ts        # parseFrontmatter(rawMd) → {data, body}
│   │   │   └── links.ts              # rewriteRelativeLinks for the SPA
│   │   ├── fs/
│   │   │   ├── tree.ts               # walkFolder(root) → TreeNode[]
│   │   │   └── resolve.ts            # resolveSafePath() — prevents escapes
│   │   └── watcher.ts                # createWatcher(path) → EventEmitter
│   └── client/
│       ├── main.tsx                  # Preact entry, router setup
│       ├── App.tsx                   # 3-pane layout, theme provider
│       ├── components/
│       │   ├── FolderTree.tsx        # Sidebar tree view
│       │   ├── Content.tsx           # Renders fetched HTML
│       │   ├── Outline.tsx           # Heading outline + collapse + scroll-spy
│       │   ├── Breadcrumbs.tsx       # Current heading path
│       │   └── MermaidBlock.tsx      # Lazy mermaid renderer
│       ├── hooks/
│       │   ├── useFile.ts            # Fetches /api/file
│       │   ├── useTree.ts            # Fetches /api/tree
│       │   ├── useScrollSpy.ts       # Tracks active heading from scroll
│       │   ├── useSSE.ts             # SSE subscription
│       │   └── useTheme.ts           # OS theme detection
│       ├── lib/
│       │   ├── mermaid-loader.ts     # Dynamic import of mermaid
│       │   └── link-router.ts        # Intercepts internal md links
│       └── styles/
│           ├── reset.css
│           ├── theme.css             # CSS variables for light/dark
│           ├── layout.css            # 3-pane layout
│           ├── content.css           # Markdown content typography & color
│           └── components.css        # Sidebar, outline, breadcrumbs styling
└── tests/
    ├── server/
    │   ├── markdown.test.ts
    │   ├── outline.test.ts
    │   ├── frontmatter.test.ts
    │   ├── links.test.ts
    │   ├── tree.test.ts
    │   └── resolve.test.ts
    └── client/
        ├── outline-collapse.test.tsx
        └── scroll-spy.test.ts
```

---

## Phase 1: Project Bootstrap

### Task 1: Initialize package + dependencies

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "mdview",
  "version": "0.1.0",
  "description": "Local CLI markdown viewer with live reload, outline navigation, and folder browsing",
  "type": "module",
  "bin": {
    "mdview": "./bin/mdview.mjs"
  },
  "files": ["bin", "dist"],
  "scripts": {
    "dev:client": "vite",
    "build:client": "vite build",
    "build:server": "tsup",
    "build": "npm run build:client && npm run build:server",
    "start": "node bin/mdview.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit && tsc -p tsconfig.client.json --noEmit"
  },
  "dependencies": {
    "@fastify/static": "^7.0.4",
    "chokidar": "^4.0.1",
    "fastify": "^5.0.0",
    "gray-matter": "^4.0.3",
    "markdown-it": "^14.1.0",
    "markdown-it-anchor": "^9.2.0",
    "markdown-it-task-lists": "^2.1.1",
    "open": "^10.1.0",
    "shiki": "^1.22.0"
  },
  "devDependencies": {
    "@preact/signals": "^1.3.0",
    "@types/markdown-it": "^14.1.2",
    "@types/markdown-it-task-lists": "^2.1.3",
    "@types/node": "^22.7.0",
    "happy-dom": "^15.7.4",
    "mermaid": "^11.3.0",
    "preact": "^10.24.2",
    "tsup": "^8.3.0",
    "typescript": "^5.6.3",
    "vite": "^6.0.0",
    "vitest": "^2.1.0",
    "wouter-preact": "^3.3.5"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules
dist
bin/mdview.mjs
.DS_Store
*.log
.vscode
.idea
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` populated, no peer dependency errors.

- [ ] **Step 4: Commit**

```bash
git init
git add package.json .gitignore
git commit -m "chore: bootstrap mdview project with dependencies"
```

---

### Task 2: TypeScript + Vite + tsup configuration

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.client.json`
- Create: `vite.config.ts`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `tsconfig.json` (server / cli / tests)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src/cli.ts", "src/server/**/*", "src/shared/**/*", "tests/server/**/*"],
  "exclude": ["src/client", "tests/client", "node_modules", "dist"]
}
```

- [ ] **Step 2: Create `tsconfig.client.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "paths": {
      "react": ["./node_modules/preact/compat"],
      "react-dom": ["./node_modules/preact/compat"]
    }
  },
  "include": ["src/client/**/*", "src/shared/**/*", "tests/client/**/*"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite' /* not added; using vite alias instead */;
import path from 'node:path';

export default defineConfig({
  root: 'src/client',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/client/index.html'),
    },
  },
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:7331',
    },
  },
});
```

> **Note:** `@preact/preset-vite` is *not* added as a dependency intentionally — the `esbuild` block + alias gives us JSX without the extra plugin. Remove the unused import line above when copying.

Replace the imports block with:

```ts
import { defineConfig } from 'vite';
import path from 'node:path';
```

- [ ] **Step 4: Create `tsup.config.ts` (builds CLI + server bundle)**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'mdview': 'src/cli.ts',
  },
  format: ['esm'],
  outDir: 'bin',
  outExtension: () => ({ js: '.mjs' }),
  target: 'node20',
  sourcemap: true,
  clean: false,
  bundle: true,
  splitting: false,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
});
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/server/**/*.test.ts'],
    environmentMatchGlobs: [['tests/client/**', 'happy-dom']],
  },
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
});
```

- [ ] **Step 6: Verify TypeScript configs compile**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

Run: `npx tsc -p tsconfig.client.json --noEmit`
Expected: errors about missing files (none yet) — that's fine; we'll resolve as we add files. If hard errors about config syntax, fix.

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json tsconfig.client.json vite.config.ts tsup.config.ts vitest.config.ts
git commit -m "chore: typescript, vite, tsup, vitest configuration"
```

---

### Task 3: Shared types module

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Define cross-tier types**

```ts
// src/shared/types.ts

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface OutlineNode {
  id: string;          // anchor id (slug)
  text: string;        // heading text
  level: HeadingLevel;
  children: OutlineNode[];
}

export interface RenderedFile {
  relPath: string;             // path relative to root, forward slashes
  html: string;                // rendered body HTML (no <html>, no <head>)
  outline: OutlineNode[];
  frontmatter: Record<string, unknown> | null;
  title: string | null;        // extracted from H1 or frontmatter.title
}

export interface TreeNode {
  name: string;
  relPath: string;
  type: 'file' | 'dir';
  children?: TreeNode[];       // dirs only
  isMarkdown?: boolean;        // files: true if .md/.markdown
}

export interface RootInfo {
  rootKind: 'file' | 'dir';
  rootRelPath: string;         // '' for dir mode; the file's relative path for file mode
  rootName: string;            // basename
}

export type WatchEvent =
  | { kind: 'change'; relPath: string }
  | { kind: 'add'; relPath: string }
  | { kind: 'unlink'; relPath: string };
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: shared types between server and client"
```

---

## Phase 2: Server Core

### Task 4: Markdown rendering pipeline (TDD)

**Files:**
- Create: `tests/server/markdown.test.ts`
- Create: `src/server/render/markdown.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/server/markdown.test.ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../../src/server/render/markdown.js';

describe('renderMarkdown', () => {
  it('renders headings with stable slug ids', async () => {
    const { html } = await renderMarkdown('# Hello World\n\n## A Subheading');
    expect(html).toContain('id="hello-world"');
    expect(html).toContain('id="a-subheading"');
  });

  it('renders GFM tables', async () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |';
    const { html } = await renderMarkdown(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders task lists with checkboxes', async () => {
    const { html } = await renderMarkdown('- [x] done\n- [ ] todo');
    expect(html).toMatch(/<input[^>]+type="checkbox"[^>]+checked/);
  });

  it('renders strikethrough', async () => {
    const { html } = await renderMarkdown('~~gone~~');
    expect(html).toContain('<s>gone</s>');
  });

  it('does not autolink http urls without explicit syntax in plain text', async () => {
    // markdown-it's linkify is opt-in; we enable it
    const { html } = await renderMarkdown('see https://example.com');
    expect(html).toContain('<a href="https://example.com"');
  });

  it('passes inline HTML through', async () => {
    const { html } = await renderMarkdown('<details><summary>x</summary>y</details>');
    expect(html).toContain('<details>');
  });

  it('returns the raw token list for downstream consumers', async () => {
    const result = await renderMarkdown('# Hi');
    expect(result.tokens.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/markdown.test.ts`
Expected: FAIL with "Cannot find module '.../render/markdown.js'".

- [ ] **Step 3: Implement `renderMarkdown`**

```ts
// src/server/render/markdown.ts
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import taskLists from 'markdown-it-task-lists';
import { highlightCode } from './shiki.js';

export interface RenderResult {
  html: string;
  tokens: ReturnType<MarkdownIt['parse']>;
}

const md = new MarkdownIt({
  html: true,        // pass-through inline HTML (user's own files, trusted)
  linkify: true,
  typographer: false,
  breaks: false,
  highlight: () => '', // overridden below — async highlight requires custom flow
});

md.use(anchor, {
  permalink: false,
  slugify: (s) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^\wÀ-ɏ\s-]/g, '')
      .replace(/\s+/g, '-'),
});
md.use(taskLists, { enabled: false, label: false });

export async function renderMarkdown(source: string): Promise<RenderResult> {
  // Two-pass: parse to tokens, walk fenced code blocks, replace with highlighted HTML.
  const tokens = md.parse(source, {});
  for (const token of tokens) {
    if (token.type === 'fence') {
      const lang = token.info.trim().split(/\s+/)[0] || 'text';
      // Mermaid is rendered client-side: leave as a marker the client recognizes.
      if (lang === 'mermaid') {
        token.type = 'html_block';
        token.content =
          `<div class="mermaid-block" data-source="${encodeURIComponent(token.content)}"></div>\n`;
      } else {
        const highlighted = await highlightCode(token.content, lang);
        token.type = 'html_block';
        token.content = highlighted + '\n';
      }
    }
  }
  const html = md.renderer.render(tokens, md.options, {});
  return { html, tokens };
}
```

- [ ] **Step 4: Stub `highlightCode` so the markdown test compiles**

```ts
// src/server/render/shiki.ts (temporary stub; real impl in Task 5)
export async function highlightCode(code: string, _lang: string): Promise<string> {
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<pre><code>${escaped}</code></pre>`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/server/markdown.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/server/markdown.test.ts src/server/render/markdown.ts src/server/render/shiki.ts
git commit -m "feat: markdown rendering pipeline with GFM + anchors"
```

---

### Task 5: Real Shiki integration

**Files:**
- Modify: `src/server/render/shiki.ts`
- Create: `tests/server/shiki.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/server/shiki.test.ts
import { describe, it, expect } from 'vitest';
import { highlightCode } from '../../src/server/render/shiki.js';

describe('highlightCode', () => {
  it('produces shiki-themed html for known language', async () => {
    const html = await highlightCode('const x = 1;', 'ts');
    expect(html).toContain('<pre');
    expect(html).toContain('class="shiki');
    // dual-theme produces both light and dark inline styles
    expect(html).toMatch(/style="[^"]*color:/);
  });

  it('falls back gracefully for unknown language', async () => {
    const html = await highlightCode('hello', 'definitely-not-a-language');
    expect(html).toContain('<pre');
    expect(html).toContain('hello');
  });

  it('escapes html in code content', async () => {
    const html = await highlightCode('<script>alert(1)</script>', 'html');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/shiki.test.ts`
Expected: FAIL — current stub doesn't include `class="shiki`.

- [ ] **Step 3: Replace stub with real Shiki**

```ts
// src/server/render/shiki.ts
import { createHighlighter, type Highlighter } from 'shiki';

const COMMON_LANGUAGES = [
  'ts', 'tsx', 'js', 'jsx',
  'python', 'go', 'rust', 'java', 'kotlin',
  'css', 'scss', 'html', 'json', 'yaml', 'toml',
  'bash', 'shell', 'sql', 'md', 'diff', 'dockerfile',
];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: COMMON_LANGUAGES,
    });
  }
  return highlighterPromise;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function highlightCode(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter();
  const loaded = highlighter.getLoadedLanguages();
  let effectiveLang = lang;
  if (lang && !loaded.includes(lang as never) && !['text', 'plain', ''].includes(lang)) {
    try {
      await highlighter.loadLanguage(lang as never);
    } catch {
      effectiveLang = 'text';
    }
  }
  try {
    return highlighter.codeToHtml(code, {
      lang: effectiveLang || 'text',
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false, // emit both via CSS variables — see styles/theme.css
    });
  } catch {
    return `<pre class="shiki shiki-fallback"><code>${escapeHtml(code)}</code></pre>`;
  }
}
```

- [ ] **Step 4: Run all server tests**

Run: `npx vitest run tests/server`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/render/shiki.ts tests/server/shiki.test.ts
git commit -m "feat: shiki dual-theme syntax highlighting with lazy language load"
```

---

### Task 6: Frontmatter parsing (TDD)

**Files:**
- Create: `tests/server/frontmatter.test.ts`
- Create: `src/server/render/frontmatter.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/server/frontmatter.test.ts
import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/server/render/frontmatter.js';

describe('parseFrontmatter', () => {
  it('parses YAML front matter and strips it from body', () => {
    const raw = '---\ntitle: Hi\ntags: [a, b]\n---\n# Body';
    const { data, body } = parseFrontmatter(raw);
    expect(data).toEqual({ title: 'Hi', tags: ['a', 'b'] });
    expect(body).toBe('# Body');
  });

  it('returns null data for files without front matter', () => {
    const { data, body } = parseFrontmatter('# Just a heading');
    expect(data).toBeNull();
    expect(body).toBe('# Just a heading');
  });

  it('handles empty front matter block', () => {
    const { data, body } = parseFrontmatter('---\n---\nbody');
    expect(data).toEqual({});
    expect(body).toBe('body');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/frontmatter.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/server/render/frontmatter.ts
import matter from 'gray-matter';

export interface FrontmatterResult {
  data: Record<string, unknown> | null;
  body: string;
}

export function parseFrontmatter(raw: string): FrontmatterResult {
  if (!raw.startsWith('---')) {
    return { data: null, body: raw };
  }
  try {
    const parsed = matter(raw);
    return {
      data: parsed.data && Object.keys(parsed.data).length >= 0 ? parsed.data : null,
      body: parsed.content.replace(/^\n+/, ''),
    };
  } catch {
    return { data: null, body: raw };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/server/frontmatter.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/server/frontmatter.test.ts src/server/render/frontmatter.ts
git commit -m "feat: front matter parsing with gray-matter"
```

---

### Task 7: Outline extraction (TDD)

**Files:**
- Create: `tests/server/outline.test.ts`
- Create: `src/server/render/outline.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/server/outline.test.ts
import { describe, it, expect } from 'vitest';
import { extractOutline } from '../../src/server/render/outline.js';
import { renderMarkdown } from '../../src/server/render/markdown.js';

describe('extractOutline', () => {
  it('builds a flat outline for a single level', async () => {
    const { tokens } = await renderMarkdown('# A\n# B\n# C');
    const outline = extractOutline(tokens);
    expect(outline).toHaveLength(3);
    expect(outline.map((n) => n.text)).toEqual(['A', 'B', 'C']);
    expect(outline.every((n) => n.children.length === 0)).toBe(true);
  });

  it('nests sub-headings as children', async () => {
    const { tokens } = await renderMarkdown('# A\n## A.1\n### A.1.a\n## A.2\n# B');
    const outline = extractOutline(tokens);
    expect(outline).toHaveLength(2);
    const a = outline[0]!;
    expect(a.text).toBe('A');
    expect(a.children).toHaveLength(2);
    expect(a.children[0]!.text).toBe('A.1');
    expect(a.children[0]!.children[0]!.text).toBe('A.1.a');
  });

  it('handles non-monotonic skips (h1 → h3 with no h2)', async () => {
    const { tokens } = await renderMarkdown('# A\n### deep');
    const outline = extractOutline(tokens);
    expect(outline[0]!.children[0]!.text).toBe('deep');
    expect(outline[0]!.children[0]!.level).toBe(3);
  });

  it('ids match anchor slugs in rendered html', async () => {
    const md = '# Hello World\n## Sub Section!';
    const { tokens, html } = await renderMarkdown(md);
    const outline = extractOutline(tokens);
    for (const node of outline) {
      expect(html).toContain(`id="${node.id}"`);
      for (const child of node.children) {
        expect(html).toContain(`id="${child.id}"`);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/outline.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/server/render/outline.ts
import type Token from 'markdown-it/lib/token.mjs';
import type { OutlineNode, HeadingLevel } from '../../shared/types.js';

export function extractOutline(tokens: Token[]): OutlineNode[] {
  const flat: OutlineNode[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type !== 'heading_open') continue;
    const level = Number(t.tag.slice(1)) as HeadingLevel;
    const inline = tokens[i + 1];
    const id = (t.attrGet('id') ?? '').toString();
    const text = inline?.content?.trim() ?? '';
    if (!id || !text) continue;
    flat.push({ id, text, level, children: [] });
  }
  return nest(flat);
}

function nest(flat: OutlineNode[]): OutlineNode[] {
  const root: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  for (const node of flat) {
    while (stack.length && stack[stack.length - 1]!.level >= node.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1]!.children.push(node);
    }
    stack.push(node);
  }
  return root;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/server/outline.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/server/outline.test.ts src/server/render/outline.ts
git commit -m "feat: outline extraction with hierarchy nesting"
```

---

### Task 8: Safe path resolution (TDD)

**Files:**
- Create: `tests/server/resolve.test.ts`
- Create: `src/server/fs/resolve.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/server/resolve.test.ts
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { resolveSafePath } from '../../src/server/fs/resolve.js';

describe('resolveSafePath', () => {
  const root = path.resolve('/tmp/mdview-fixture');

  it('resolves a relative path inside root', () => {
    const result = resolveSafePath(root, 'docs/intro.md');
    expect(result).toBe(path.join(root, 'docs/intro.md'));
  });

  it('rejects paths that escape root via ..', () => {
    expect(() => resolveSafePath(root, '../../etc/passwd')).toThrow(/outside root/);
  });

  it('rejects absolute paths', () => {
    expect(() => resolveSafePath(root, '/etc/passwd')).toThrow(/absolute/);
  });

  it('treats empty as root', () => {
    expect(resolveSafePath(root, '')).toBe(root);
  });

  it('normalizes redundant segments', () => {
    expect(resolveSafePath(root, './docs/./intro.md')).toBe(path.join(root, 'docs/intro.md'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/resolve.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/server/fs/resolve.ts
import path from 'node:path';

export function resolveSafePath(root: string, relPath: string): string {
  if (path.isAbsolute(relPath)) {
    throw new Error(`Refusing absolute path: ${relPath}`);
  }
  const absRoot = path.resolve(root);
  const candidate = path.resolve(absRoot, relPath);
  const rel = path.relative(absRoot, candidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path resolves outside root: ${relPath}`);
  }
  return candidate;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/server/resolve.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/server/resolve.test.ts src/server/fs/resolve.ts
git commit -m "feat: safe path resolver to prevent traversal"
```

---

### Task 9: Folder tree walker (TDD)

**Files:**
- Create: `tests/server/tree.test.ts`
- Create: `src/server/fs/tree.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/server/tree.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { walkFolder } from '../../src/server/fs/tree.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'mdview-tree-'));
  mkdirSync(path.join(root, 'guides'));
  writeFileSync(path.join(root, 'README.md'), '# r');
  writeFileSync(path.join(root, 'image.png'), '');
  writeFileSync(path.join(root, 'guides', 'intro.md'), '# i');
  writeFileSync(path.join(root, 'guides', 'advanced.markdown'), '# a');
  mkdirSync(path.join(root, '.git'));
  writeFileSync(path.join(root, '.git', 'HEAD'), 'ref');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('walkFolder', () => {
  it('lists md files and recurses into directories', async () => {
    const tree = await walkFolder(root);
    expect(tree.length).toBeGreaterThan(0);

    const names = tree.map((n) => n.name).sort();
    expect(names).toContain('README.md');
    expect(names).toContain('image.png');
    expect(names).toContain('guides');

    const guides = tree.find((n) => n.name === 'guides')!;
    expect(guides.type).toBe('dir');
    expect(guides.children!.map((n) => n.name).sort()).toEqual(['advanced.markdown', 'intro.md']);
    expect(guides.children!.every((n) => n.isMarkdown)).toBe(true);
  });

  it('marks non-md files with isMarkdown: false', async () => {
    const tree = await walkFolder(root);
    const png = tree.find((n) => n.name === 'image.png')!;
    expect(png.type).toBe('file');
    expect(png.isMarkdown).toBe(false);
  });

  it('skips dot-directories like .git', async () => {
    const tree = await walkFolder(root);
    expect(tree.find((n) => n.name === '.git')).toBeUndefined();
  });

  it('returns relPath using forward slashes', async () => {
    const tree = await walkFolder(root);
    const intro = tree
      .find((n) => n.name === 'guides')!
      .children!.find((n) => n.name === 'intro.md')!;
    expect(intro.relPath).toBe('guides/intro.md');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/tree.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/server/fs/tree.ts
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { TreeNode } from '../../shared/types.js';

const MD_EXT = new Set(['.md', '.markdown', '.mdx']);

export async function walkFolder(root: string, relBase = ''): Promise<TreeNode[]> {
  const absDir = path.join(root, relBase);
  const entries = await readdir(absDir, { withFileTypes: true });

  const out: TreeNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;     // skip dotfiles & dotdirs
    if (entry.name === 'node_modules') continue;  // ergonomic skip

    const childRel = relBase ? `${relBase}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const children = await walkFolder(root, childRel);
      out.push({
        name: entry.name,
        relPath: childRel,
        type: 'dir',
        children,
      });
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      out.push({
        name: entry.name,
        relPath: childRel,
        type: 'file',
        isMarkdown: MD_EXT.has(ext),
      });
    }
  }

  out.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/server/tree.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/server/tree.test.ts src/server/fs/tree.ts
git commit -m "feat: folder tree walker with markdown detection"
```

---

### Task 10: Internal link rewriter (TDD)

**Files:**
- Create: `tests/server/links.test.ts`
- Create: `src/server/render/links.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/server/links.test.ts
import { describe, it, expect } from 'vitest';
import { tagInternalLinks } from '../../src/server/render/links.js';

describe('tagInternalLinks', () => {
  it('marks relative md links as internal with data attribute', () => {
    const html = '<a href="other.md">x</a>';
    const out = tagInternalLinks(html, 'guides/intro.md');
    expect(out).toContain('data-internal-link="guides/other.md"');
  });

  it('preserves anchor on internal link', () => {
    const html = '<a href="other.md#section-2">x</a>';
    const out = tagInternalLinks(html, 'guides/intro.md');
    expect(out).toContain('data-internal-link="guides/other.md#section-2"');
  });

  it('leaves http(s) links alone', () => {
    const html = '<a href="https://example.com">x</a>';
    const out = tagInternalLinks(html, 'a.md');
    expect(out).not.toContain('data-internal-link');
  });

  it('leaves bare anchor links alone (same-doc nav)', () => {
    const html = '<a href="#heading">x</a>';
    const out = tagInternalLinks(html, 'a.md');
    expect(out).not.toContain('data-internal-link');
  });

  it('resolves ../ paths', () => {
    const html = '<a href="../top.md">x</a>';
    const out = tagInternalLinks(html, 'guides/intro.md');
    expect(out).toContain('data-internal-link="top.md"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/links.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// src/server/render/links.ts
import path from 'node:path/posix';

const MD_EXT_RE = /\.(md|markdown|mdx)$/i;
const HREF_RE = /<a\s+([^>]*?)href="([^"#?]*)(\?[^"#]*)?(#[^"]*)?"([^>]*)>/gi;

export function tagInternalLinks(html: string, currentRelPath: string): string {
  const currentDir = path.dirname(currentRelPath);
  return html.replace(HREF_RE, (full, pre, target, query, hash, post) => {
    if (!target || /^https?:\/\//i.test(target) || target.startsWith('mailto:')) {
      return full;
    }
    if (!MD_EXT_RE.test(target)) return full;

    const resolved = path.normalize(path.join(currentDir, target));
    const internal = `${resolved}${query ?? ''}${hash ?? ''}`;
    return `<a ${pre}href="${internal}" data-internal-link="${internal}"${post}>`;
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/server/links.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/server/links.test.ts src/server/render/links.ts
git commit -m "feat: tag relative md links with data-internal-link attribute"
```

---

### Task 11: Fastify server skeleton + /api/file route

**Files:**
- Create: `src/server/index.ts`
- Create: `src/server/routes/api-file.ts`

- [ ] **Step 1: Implement server factory**

```ts
// src/server/index.ts
import Fastify, { type FastifyInstance } from 'fastify';
import path from 'node:path';
import { registerApiFile } from './routes/api-file.js';
import { registerApiTree } from './routes/api-tree.js';
import { registerSse } from './routes/sse.js';
import { createWatcher } from './watcher.js';
import type { RootInfo } from '../shared/types.js';

export interface ServerOptions {
  rootAbsPath: string;
  rootInfo: RootInfo;
  clientDir: string; // built SPA
  port: number;
}

export async function createServer(opts: ServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const watcher = createWatcher(opts.rootAbsPath);

  registerApiFile(app, opts.rootAbsPath, opts.rootInfo);
  registerApiTree(app, opts.rootAbsPath, opts.rootInfo);
  registerSse(app, watcher);

  await app.register(import('@fastify/static'), {
    root: opts.clientDir,
    prefix: '/',
    decorateReply: false,
  });

  // SPA fallback: any non-/api route serves index.html
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'Not found' });
      return;
    }
    return reply.sendFile('index.html');
  });

  app.addHook('onClose', async () => {
    await watcher.close();
  });

  return app;
}
```

- [ ] **Step 2: Implement /api/file route**

```ts
// src/server/routes/api-file.ts
import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolveSafePath } from '../fs/resolve.js';
import { renderMarkdown } from '../render/markdown.js';
import { extractOutline } from '../render/outline.js';
import { parseFrontmatter } from '../render/frontmatter.js';
import { tagInternalLinks } from '../render/links.js';
import type { RenderedFile, RootInfo } from '../../shared/types.js';

export function registerApiFile(
  app: FastifyInstance,
  rootAbsPath: string,
  rootInfo: RootInfo,
): void {
  app.get<{ Querystring: { path?: string } }>('/api/file', async (req, reply) => {
    const requested = req.query.path?.trim() ?? '';
    let relPath: string;

    if (rootInfo.rootKind === 'file') {
      // Single-file mode: only the boot file is allowed
      if (requested && requested !== rootInfo.rootRelPath) {
        return reply.code(404).send({ error: 'File not found in single-file mode' });
      }
      relPath = rootInfo.rootRelPath;
    } else {
      if (!requested) {
        return reply.code(400).send({ error: 'Missing ?path' });
      }
      relPath = requested;
    }

    let absPath: string;
    try {
      absPath = resolveSafePath(rootAbsPath, relPath);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }

    let raw: string;
    try {
      raw = await readFile(absPath, 'utf8');
    } catch {
      return reply.code(404).send({ error: 'File not found' });
    }

    const { data, body } = parseFrontmatter(raw);
    const { html: rawHtml, tokens } = await renderMarkdown(body);
    const html = tagInternalLinks(rawHtml, relPath);
    const outline = extractOutline(tokens);
    const title =
      (typeof data?.title === 'string' ? data.title : null) ??
      outline[0]?.text ??
      null;

    const result: RenderedFile = { relPath, html, outline, frontmatter: data, title };
    return reply.send(result);
  });
}
```

- [ ] **Step 3: Build to type-check**

Run: `npx tsc --noEmit`
Expected: errors only for files not yet created (`api-tree.ts`, `sse.ts`, `watcher.ts`). Fix in next tasks.

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts src/server/routes/api-file.ts
git commit -m "feat: fastify server scaffold + /api/file route"
```

---

### Task 12: /api/tree route + RootInfo

**Files:**
- Create: `src/server/routes/api-tree.ts`

- [ ] **Step 1: Implement**

```ts
// src/server/routes/api-tree.ts
import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { walkFolder } from '../fs/tree.js';
import type { RootInfo, TreeNode } from '../../shared/types.js';

export function registerApiTree(
  app: FastifyInstance,
  rootAbsPath: string,
  rootInfo: RootInfo,
): void {
  app.get('/api/tree', async (_req, reply) => {
    if (rootInfo.rootKind === 'file') {
      const single: TreeNode[] = [
        {
          name: path.basename(rootInfo.rootRelPath),
          relPath: rootInfo.rootRelPath,
          type: 'file',
          isMarkdown: true,
        },
      ];
      return reply.send({ root: rootInfo, tree: single });
    }
    const tree = await walkFolder(rootAbsPath);
    return reply.send({ root: rootInfo, tree });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/routes/api-tree.ts
git commit -m "feat: /api/tree endpoint"
```

---

### Task 13: chokidar watcher

**Files:**
- Create: `src/server/watcher.ts`

- [ ] **Step 1: Implement**

```ts
// src/server/watcher.ts
import { EventEmitter } from 'node:events';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { WatchEvent } from '../shared/types.js';

export interface Watcher {
  on(event: 'event', listener: (e: WatchEvent) => void): void;
  off(event: 'event', listener: (e: WatchEvent) => void): void;
  close(): Promise<void>;
}

export function createWatcher(rootAbsPath: string): Watcher {
  const emitter = new EventEmitter();

  const watcher: FSWatcher = chokidar.watch(rootAbsPath, {
    ignoreInitial: true,
    ignored: (p: string) => /(^|[\/\\])\../.test(path.basename(p)) || /node_modules/.test(p),
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 60, pollInterval: 30 },
  });

  function emit(kind: WatchEvent['kind'], abs: string) {
    const rel = path.relative(rootAbsPath, abs).split(path.sep).join('/');
    if (!rel) return;
    emitter.emit('event', { kind, relPath: rel } satisfies WatchEvent);
  }

  watcher.on('change', (p) => emit('change', p));
  watcher.on('add', (p) => emit('add', p));
  watcher.on('unlink', (p) => emit('unlink', p));

  return {
    on: (event, listener) => emitter.on(event, listener),
    off: (event, listener) => emitter.off(event, listener),
    close: () => watcher.close(),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/watcher.ts
git commit -m "feat: chokidar-based file watcher with relative-path events"
```

---

### Task 14: SSE endpoint

**Files:**
- Create: `src/server/routes/sse.ts`

- [ ] **Step 1: Implement**

```ts
// src/server/routes/sse.ts
import type { FastifyInstance } from 'fastify';
import type { Watcher } from '../watcher.js';
import type { WatchEvent } from '../../shared/types.js';

export function registerSse(app: FastifyInstance, watcher: Watcher): void {
  app.get('/api/watch', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const send = (e: WatchEvent) => {
      reply.raw.write(`event: ${e.kind}\n`);
      reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    watcher.on('event', send);

    const heartbeat = setInterval(() => reply.raw.write(': hb\n\n'), 15_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      watcher.off('event', send);
      try { reply.raw.end(); } catch { /* already closed */ }
    });
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors for server code; client errors are fine for now.

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/sse.ts
git commit -m "feat: SSE endpoint that streams watcher events"
```

---

### Task 15: CLI entry point

**Files:**
- Create: `src/cli.ts`

- [ ] **Step 1: Implement CLI**

```ts
// src/cli.ts
import path from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from './server/index.js';
import openBrowser from 'open';
import type { RootInfo } from './shared/types.js';

function printUsage(): void {
  console.error(`
mdview — local markdown viewer

Usage:
  mdview <path>            File or folder to view
  mdview                   View current directory

Options:
  --port <n>               Port to listen on (default: 7331; auto-fallback)
  --no-open                Don't auto-launch the browser
  --help, -h               Show this help
`.trim());
}

interface Args {
  target: string;
  port: number;
  open: boolean;
}

function parseArgs(argv: string[]): Args | null {
  const args: Args = { target: '.', port: 7331, open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-h' || a === '--help') return null;
    if (a === '--no-open') { args.open = false; continue; }
    if (a === '--port') {
      const v = argv[++i];
      if (!v) throw new Error('--port requires a number');
      args.port = Number(v);
      if (!Number.isInteger(args.port) || args.port <= 0) throw new Error('Invalid --port');
      continue;
    }
    if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    args.target = a;
  }
  return args;
}

function detectRoot(target: string): { rootAbsPath: string; rootInfo: RootInfo } {
  const abs = path.resolve(target);
  if (!existsSync(abs)) throw new Error(`Path does not exist: ${abs}`);
  const st = statSync(abs);
  if (st.isDirectory()) {
    return {
      rootAbsPath: abs,
      rootInfo: { rootKind: 'dir', rootRelPath: '', rootName: path.basename(abs) },
    };
  }
  if (st.isFile()) {
    return {
      rootAbsPath: path.dirname(abs),
      rootInfo: {
        rootKind: 'file',
        rootRelPath: path.basename(abs),
        rootName: path.basename(abs),
      },
    };
  }
  throw new Error(`Unsupported path type: ${abs}`);
}

async function listen(app: Awaited<ReturnType<typeof createServer>>, port: number): Promise<number> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await app.listen({ host: '127.0.0.1', port: port + attempt });
      return port + attempt;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error('Could not bind a port (tried 10 in a row).');
}

async function main(): Promise<void> {
  let args: Args | null;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    printUsage();
    process.exit(2);
  }
  if (!args) { printUsage(); process.exit(0); }

  const { rootAbsPath, rootInfo } = detectRoot(args.target);

  const here = path.dirname(fileURLToPath(import.meta.url));
  // bin/mdview.mjs sits beside dist/client (after npm publish) or in dev: ../dist/client
  const clientDirCandidates = [
    path.resolve(here, '../dist/client'),
    path.resolve(here, '../../dist/client'),
  ];
  const clientDir = clientDirCandidates.find(existsSync);
  if (!clientDir) {
    console.error('Client bundle not found. Run `npm run build:client` first.');
    process.exit(1);
  }

  const app = await createServer({ rootAbsPath, rootInfo, clientDir, port: args.port });
  const boundPort = await listen(app, args.port);

  const url =
    rootInfo.rootKind === 'file'
      ? `http://127.0.0.1:${boundPort}/?file=${encodeURIComponent(rootInfo.rootRelPath)}`
      : `http://127.0.0.1:${boundPort}/`;
  console.log(`mdview → ${url}`);
  console.log(`watching: ${rootAbsPath}`);

  if (args.open) await openBrowser(url);

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Build server bundle**

Run: `npx tsup`
Expected: `bin/mdview.mjs` produced.

- [ ] **Step 4: Smoke test the CLI (will fail until client built — fine for now)**

Run: `node bin/mdview.mjs --help`
Expected: usage printed; exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts
git commit -m "feat: cli entrypoint with arg parsing and port fallback"
```

---

## Phase 3: Frontend

### Task 16: Vite + Preact bootstrap

**Files:**
- Create: `src/client/index.html`
- Create: `src/client/main.tsx`
- Create: `src/client/App.tsx`
- Create: `src/client/styles/reset.css`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>mdview</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `main.tsx`**

```tsx
// src/client/main.tsx
import { render } from 'preact';
import { App } from './App.js';
import './styles/reset.css';
import './styles/theme.css';
import './styles/layout.css';
import './styles/content.css';
import './styles/components.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');
render(<App />, root);
```

- [ ] **Step 3: Create `App.tsx` (placeholder)**

```tsx
// src/client/App.tsx
export function App() {
  return <div>mdview booting…</div>;
}
```

- [ ] **Step 4: Create `styles/reset.css`**

```css
*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; padding: 0; }
html, body, #app { height: 100%; }
body {
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  line-height: 1.6;
  color: var(--fg);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
img, picture, video, svg { display: block; max-width: 100%; }
button { font: inherit; cursor: pointer; background: none; border: none; color: inherit; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
```

- [ ] **Step 5: Create empty placeholder stylesheets so imports resolve**

Create `src/client/styles/theme.css`, `layout.css`, `content.css`, `components.css` with `/* see later tasks */`.

- [ ] **Step 6: Run dev server**

Run: `npx vite` (uses `src/client` as root via vite.config)
Expected: dev server boots on 5173, shows "mdview booting…".

- [ ] **Step 7: Commit**

```bash
git add src/client/index.html src/client/main.tsx src/client/App.tsx src/client/styles/
git commit -m "feat: preact frontend bootstrap with placeholder app"
```

---

### Task 17: Theme system (light/dark, OS-driven)

**Files:**
- Create: `src/client/hooks/useTheme.ts`
- Modify: `src/client/styles/theme.css`

- [ ] **Step 1: Implement `useTheme` hook**

```ts
// src/client/hooks/useTheme.ts
import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';

export type Theme = 'light' | 'dark';

const mq = window.matchMedia('(prefers-color-scheme: dark)');
export const themeSignal = signal<Theme>(mq.matches ? 'dark' : 'light');

export function useTheme(): Theme {
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => {
      themeSignal.value = e.matches ? 'dark' : 'light';
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeSignal.value;
  });

  return themeSignal.value;
}
```

- [ ] **Step 2: Replace `theme.css` with real palette**

```css
/* src/client/styles/theme.css */
:root {
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", "Liberation Mono", Consolas, monospace;
  --fs-body: 16px;
  --fs-small: 13px;
  --line-width: 72ch;
  --radius: 6px;
  --transition: 160ms ease;
}

:root[data-theme="light"], :root:not([data-theme]) {
  --bg: #fcfbf8;
  --bg-elev: #ffffff;
  --bg-sidebar: #f5f3ee;
  --fg: #1f2328;
  --fg-muted: #6e7681;
  --border: #e5e3dc;
  --link: #2563eb;
  --accent: #c2410c;          /* warm orange — heading + active outline */
  --accent-soft: #fde6d6;
  --code-bg: #f3efe6;
  --quote-bar: #c2410c;
  --quote-bg: #fdf3eb;
  --shadow: 0 1px 2px rgba(0,0,0,0.04);
}

:root[data-theme="dark"] {
  --bg: #0f1115;
  --bg-elev: #161a21;
  --bg-sidebar: #11141a;
  --fg: #e6edf3;
  --fg-muted: #8b949e;
  --border: #21262d;
  --link: #58a6ff;
  --accent: #f0883e;
  --accent-soft: #3a210e;
  --code-bg: #161a21;
  --quote-bar: #f0883e;
  --quote-bg: #1a130a;
  --shadow: 0 1px 2px rgba(0,0,0,0.5);
}

/* Shiki dual-theme: select var per data-theme */
:root[data-theme="dark"] .shiki span { color: var(--shiki-dark) !important; }
:root[data-theme="dark"] .shiki { background-color: var(--shiki-dark-bg) !important; }
:root[data-theme="light"] .shiki span,
:root:not([data-theme]) .shiki span { color: var(--shiki-light) !important; }
:root[data-theme="light"] .shiki,
:root:not([data-theme]) .shiki { background-color: var(--shiki-light-bg) !important; }
```

- [ ] **Step 3: Use the hook in `App.tsx`**

```tsx
// src/client/App.tsx
import { useTheme } from './hooks/useTheme.js';

export function App() {
  useTheme();
  return <div>mdview booting…</div>;
}
```

- [ ] **Step 4: Verify**

Run dev server and toggle OS theme; the body background should swap.

- [ ] **Step 5: Commit**

```bash
git add src/client/hooks/useTheme.ts src/client/styles/theme.css src/client/App.tsx
git commit -m "feat: light/dark theme driven by OS preference"
```

---

### Task 18: Layout + 3-pane skeleton

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/styles/layout.css`

- [ ] **Step 1: Implement layout CSS**

```css
/* src/client/styles/layout.css */
.app-shell {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 280px;
  grid-template-rows: 48px minmax(0, 1fr);
  grid-template-areas:
    "tree  header  outline"
    "tree  main    outline";
  height: 100%;
  background: var(--bg);
}

.app-shell > .pane-tree { grid-area: tree; background: var(--bg-sidebar); border-right: 1px solid var(--border); overflow: auto; }
.app-shell > .pane-header { grid-area: header; background: var(--bg-elev); border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 16px; gap: 12px; }
.app-shell > .pane-main { grid-area: main; overflow: auto; padding: 32px 48px 96px; }
.app-shell > .pane-outline { grid-area: outline; background: var(--bg-sidebar); border-left: 1px solid var(--border); overflow: auto; padding: 16px 12px; }

.pane-main .markdown-body { max-width: var(--line-width); margin: 0 auto; }

@media (max-width: 1100px) {
  .app-shell { grid-template-columns: 240px minmax(0, 1fr) 0; }
  .app-shell > .pane-outline { display: none; }
}
@media (max-width: 800px) {
  .app-shell { grid-template-columns: 0 minmax(0, 1fr) 0; }
  .app-shell > .pane-tree { display: none; }
}
```

- [ ] **Step 2: Update `App.tsx` to mount skeleton panes**

```tsx
// src/client/App.tsx
import { useTheme } from './hooks/useTheme.js';

export function App() {
  useTheme();
  return (
    <div class="app-shell">
      <aside class="pane-tree">tree</aside>
      <header class="pane-header">header</header>
      <main class="pane-main">
        <article class="markdown-body">main</article>
      </main>
      <aside class="pane-outline">outline</aside>
    </div>
  );
}
```

- [ ] **Step 3: Verify** — dev server shows the 3-pane layout.

- [ ] **Step 4: Commit**

```bash
git add src/client/App.tsx src/client/styles/layout.css
git commit -m "feat: 3-pane app shell layout"
```

---

### Task 19: useFile + useTree hooks (data fetching)

**Files:**
- Create: `src/client/hooks/useFile.ts`
- Create: `src/client/hooks/useTree.ts`

- [ ] **Step 1: Implement `useFile`**

```ts
// src/client/hooks/useFile.ts
import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { RenderedFile } from '../../shared/types.js';

export const fileSignal = signal<RenderedFile | null>(null);
export const fileError = signal<string | null>(null);
export const fileLoading = signal(false);

export async function loadFile(relPath: string | null): Promise<void> {
  fileLoading.value = true;
  fileError.value = null;
  try {
    const url = relPath ? `/api/file?path=${encodeURIComponent(relPath)}` : '/api/file';
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
```

- [ ] **Step 2: Implement `useTree`**

```ts
// src/client/hooks/useTree.ts
import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { TreeNode, RootInfo } from '../../shared/types.js';

export const treeSignal = signal<{ root: RootInfo; tree: TreeNode[] } | null>(null);

export function useTree() {
  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/tree');
      if (res.ok) treeSignal.value = await res.json();
    })();
  }, []);
  return treeSignal.value;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/client/hooks/useFile.ts src/client/hooks/useTree.ts
git commit -m "feat: useFile + useTree data hooks with signals"
```

---

### Task 20: Folder tree component

**Files:**
- Create: `src/client/components/FolderTree.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/client/components/FolderTree.tsx
import { useState } from 'preact/hooks';
import type { TreeNode } from '../../shared/types.js';

interface Props {
  tree: TreeNode[];
  currentPath: string | null;
  onSelect: (relPath: string) => void;
}

export function FolderTree({ tree, currentPath, onSelect }: Props) {
  return (
    <ul class="tree">
      {tree.map((node) => (
        <TreeItem key={node.relPath} node={node} currentPath={currentPath} onSelect={onSelect} depth={0} />
      ))}
    </ul>
  );
}

interface ItemProps {
  node: TreeNode;
  currentPath: string | null;
  onSelect: (relPath: string) => void;
  depth: number;
}

function TreeItem({ node, currentPath, onSelect, depth }: ItemProps) {
  const [open, setOpen] = useState(true);
  const pad = { paddingLeft: `${8 + depth * 14}px` };

  if (node.type === 'dir') {
    return (
      <li>
        <button class="tree-item tree-dir" style={pad} onClick={() => setOpen((o) => !o)}>
          <span class={`chev ${open ? 'open' : ''}`} aria-hidden>▸</span>
          <span class="name">{node.name}</span>
        </button>
        {open && node.children && (
          <ul>
            {node.children.map((c) => (
              <TreeItem key={c.relPath} node={c} currentPath={currentPath} onSelect={onSelect} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isMd = node.isMarkdown ?? false;
  const isCurrent = currentPath === node.relPath;
  return (
    <li>
      <button
        class={`tree-item tree-file ${isMd ? '' : 'is-disabled'} ${isCurrent ? 'is-current' : ''}`}
        style={pad}
        disabled={!isMd}
        onClick={() => isMd && onSelect(node.relPath)}
      >
        <span class="name">{node.name}</span>
      </button>
    </li>
  );
}
```

- [ ] **Step 2: Style**

Append to `src/client/styles/components.css`:

```css
.tree { list-style: none; padding: 8px 0; font-size: var(--fs-small); }
.tree ul { list-style: none; }
.tree-item {
  display: flex; align-items: center; gap: 6px;
  width: 100%; padding: 4px 12px; text-align: left;
  border-radius: var(--radius);
  transition: background var(--transition), color var(--transition);
}
.tree-item:hover { background: var(--accent-soft); }
.tree-file.is-current { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
.tree-file.is-disabled { color: var(--fg-muted); cursor: default; }
.tree-file.is-disabled:hover { background: transparent; }
.tree .chev { display: inline-block; transition: transform var(--transition); color: var(--fg-muted); }
.tree .chev.open { transform: rotate(90deg); }
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/FolderTree.tsx src/client/styles/components.css
git commit -m "feat: collapsible folder tree component"
```

---

### Task 21: Content component (renders fetched HTML safely)

**Files:**
- Create: `src/client/components/Content.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/client/components/Content.tsx
import { useEffect, useRef } from 'preact/hooks';
import type { RenderedFile } from '../../shared/types.js';
import { renderMermaidIn } from '../lib/mermaid-loader.js';
import { wireInternalLinks } from '../lib/link-router.js';

interface Props {
  file: RenderedFile;
  onInternalNavigate: (relPath: string, hash: string) => void;
}

export function Content({ file, onInternalNavigate }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = file.html;
    void renderMermaidIn(ref.current);
    wireInternalLinks(ref.current, onInternalNavigate);
  }, [file]);

  return (
    <article class="markdown-body">
      {file.frontmatter && Object.keys(file.frontmatter).length > 0 && (
        <details class="frontmatter-block">
          <summary>frontmatter</summary>
          <pre><code>{JSON.stringify(file.frontmatter, null, 2)}</code></pre>
        </details>
      )}
      <div ref={ref} class="markdown-content" />
    </article>
  );
}
```

- [ ] **Step 2: Add markdown content styles**

```css
/* src/client/styles/content.css */
.markdown-content h1, .markdown-content h2, .markdown-content h3,
.markdown-content h4, .markdown-content h5, .markdown-content h6 {
  font-weight: 650;
  letter-spacing: -0.01em;
  margin: 1.6em 0 0.6em;
  scroll-margin-top: 64px;
}
.markdown-content h1 { font-size: 2rem;   color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: .25em; }
.markdown-content h2 { font-size: 1.5rem; color: var(--fg); }
.markdown-content h3 { font-size: 1.2rem; color: var(--fg); }
.markdown-content h4 { font-size: 1rem;   color: var(--fg-muted); text-transform: uppercase; letter-spacing: .04em; }

.markdown-content p, .markdown-content ul, .markdown-content ol { margin: 0.85em 0; }
.markdown-content ul, .markdown-content ol { padding-left: 1.5em; }
.markdown-content li { margin: .25em 0; }
.markdown-content li::marker { color: var(--accent); }

.markdown-content blockquote {
  margin: 1em 0; padding: .5em 1em;
  border-left: 3px solid var(--quote-bar);
  background: var(--quote-bg);
  border-radius: 0 var(--radius) var(--radius) 0;
  color: var(--fg-muted);
}

.markdown-content code {
  font-family: var(--font-mono); font-size: .9em;
  background: var(--code-bg); padding: 1px 5px; border-radius: 4px;
}
.markdown-content pre {
  margin: 1em 0; padding: 14px 16px;
  border-radius: var(--radius);
  overflow: auto;
  box-shadow: var(--shadow);
}
.markdown-content pre code { background: transparent; padding: 0; }

.markdown-content table {
  border-collapse: collapse; margin: 1em 0; font-size: .95em;
  background: var(--bg-elev); border-radius: var(--radius); overflow: hidden;
  box-shadow: var(--shadow);
}
.markdown-content th, .markdown-content td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
.markdown-content th { background: var(--bg-sidebar); }

.markdown-content a { color: var(--link); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; }
.markdown-content a:hover { text-decoration-thickness: 2px; }

.markdown-content hr { border: 0; border-top: 1px solid var(--border); margin: 2em 0; }

.markdown-content img { border-radius: var(--radius); margin: 1em auto; }

.markdown-content input[type="checkbox"] { margin-right: .5em; }

.frontmatter-block {
  background: var(--bg-elev); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 8px 12px; margin-bottom: 1em;
  font-size: var(--fs-small);
}
.frontmatter-block summary { cursor: pointer; color: var(--fg-muted); }
.frontmatter-block pre { margin-top: 8px; }

.mermaid-block { margin: 1em 0; text-align: center; }
.mermaid-block svg { max-width: 100%; height: auto; }
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/Content.tsx src/client/styles/content.css
git commit -m "feat: content renderer with markdown typography styles"
```

---

### Task 22: Outline component with scroll-spy + collapse (TDD on logic)

**Files:**
- Create: `src/client/hooks/useScrollSpy.ts`
- Create: `tests/client/scroll-spy.test.ts`
- Create: `src/client/components/Outline.tsx`

- [ ] **Step 1: Write test for scroll-spy logic (pure function part)**

```ts
// tests/client/scroll-spy.test.ts
import { describe, it, expect } from 'vitest';
import { pickActiveId } from '../../src/client/hooks/useScrollSpy.js';

describe('pickActiveId', () => {
  const positions = [
    { id: 'a', top: 0 },
    { id: 'b', top: 200 },
    { id: 'c', top: 500 },
  ];

  it('returns first heading when before all', () => {
    expect(pickActiveId(positions, -50)).toBe('a');
  });

  it('returns the most recently passed heading', () => {
    expect(pickActiveId(positions, 250)).toBe('b');
    expect(pickActiveId(positions, 600)).toBe('c');
  });

  it('returns null for empty list', () => {
    expect(pickActiveId([], 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Implement `useScrollSpy`**

```ts
// src/client/hooks/useScrollSpy.ts
import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';

export interface HeadingPos { id: string; top: number; }

export const activeHeadingId = signal<string | null>(null);
export const breadcrumbPath = signal<string[]>([]);

export function pickActiveId(positions: HeadingPos[], scrollTop: number): string | null {
  if (positions.length === 0) return null;
  const offset = 80; // account for fixed header
  let active = positions[0]!.id;
  for (const p of positions) {
    if (p.top - offset <= scrollTop) active = p.id;
    else break;
  }
  return active;
}

export function useScrollSpy(scrollContainer: HTMLElement | null): void {
  useEffect(() => {
    if (!scrollContainer) return;
    let raf = 0;

    function compute() {
      const headings = Array.from(
        scrollContainer!.querySelectorAll<HTMLHeadingElement>('.markdown-content :is(h1,h2,h3,h4,h5,h6)[id]'),
      );
      const positions: HeadingPos[] = headings.map((h) => ({
        id: h.id,
        top: h.offsetTop,
      }));
      activeHeadingId.value = pickActiveId(positions, scrollContainer!.scrollTop);
    }

    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    }

    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    compute();
    return () => {
      cancelAnimationFrame(raf);
      scrollContainer.removeEventListener('scroll', onScroll);
    };
  }, [scrollContainer]);
}
```

- [ ] **Step 3: Run scroll-spy tests**

Run: `npx vitest run tests/client/scroll-spy.test.ts`
Expected: all pass.

- [ ] **Step 4: Implement Outline component**

```tsx
// src/client/components/Outline.tsx
import { useState } from 'preact/hooks';
import type { OutlineNode } from '../../shared/types.js';
import { activeHeadingId } from '../hooks/useScrollSpy.js';

interface Props {
  nodes: OutlineNode[];
  onJump: (id: string) => void;
}

export function Outline({ nodes, onJump }: Props) {
  if (nodes.length === 0) return <div class="outline-empty">No headings</div>;
  return (
    <nav class="outline">
      <ul>
        {nodes.map((n) => (
          <OutlineItem key={n.id} node={n} onJump={onJump} depth={0} />
        ))}
      </ul>
    </nav>
  );
}

interface ItemProps {
  node: OutlineNode;
  onJump: (id: string) => void;
  depth: number;
}

function OutlineItem({ node, onJump, depth }: ItemProps) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;
  const isActive = activeHeadingId.value === node.id;

  return (
    <li>
      <div class={`outline-row depth-${depth} ${isActive ? 'is-active' : ''}`}>
        {hasChildren ? (
          <button
            class={`outline-toggle ${collapsed ? '' : 'open'}`}
            aria-label={collapsed ? 'Expand section' : 'Collapse section'}
            onClick={() => setCollapsed((c) => !c)}
          >
            ▸
          </button>
        ) : (
          <span class="outline-toggle is-spacer" aria-hidden />
        )}
        <button class="outline-link" onClick={() => onJump(node.id)} title={node.text}>
          {node.text}
        </button>
      </div>
      {hasChildren && !collapsed && (
        <ul>
          {node.children.map((c) => (
            <OutlineItem key={c.id} node={c} onJump={onJump} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
```

- [ ] **Step 5: Style outline**

Append to `src/client/styles/components.css`:

```css
.outline { font-size: var(--fs-small); }
.outline ul { list-style: none; }
.outline-row { display: flex; align-items: center; gap: 4px; padding: 2px 0; border-radius: var(--radius); transition: background var(--transition), color var(--transition); }
.outline-row.is-active { background: var(--accent-soft); color: var(--accent); }
.outline-row.is-active .outline-link { color: var(--accent); font-weight: 500; }
.outline-toggle { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; color: var(--fg-muted); transition: transform var(--transition); }
.outline-toggle.open { transform: rotate(90deg); }
.outline-toggle.is-spacer { visibility: hidden; }
.outline-link { flex: 1; text-align: left; padding: 2px 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.outline-link:hover { color: var(--accent); }
.outline-empty { color: var(--fg-muted); font-size: var(--fs-small); padding: 8px; }
```

- [ ] **Step 6: Commit**

```bash
git add src/client/hooks/useScrollSpy.ts tests/client/scroll-spy.test.ts src/client/components/Outline.tsx src/client/styles/components.css
git commit -m "feat: outline component with scroll-spy and collapsible sections"
```

---

### Task 23: Breadcrumbs component

**Files:**
- Create: `src/client/components/Breadcrumbs.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/client/components/Breadcrumbs.tsx
import type { OutlineNode } from '../../shared/types.js';
import { activeHeadingId } from '../hooks/useScrollSpy.js';

interface Props {
  outline: OutlineNode[];
  fileName: string | null;
}

function findPath(nodes: OutlineNode[], targetId: string, acc: OutlineNode[] = []): OutlineNode[] | null {
  for (const n of nodes) {
    const next = [...acc, n];
    if (n.id === targetId) return next;
    const deeper = findPath(n.children, targetId, next);
    if (deeper) return deeper;
  }
  return null;
}

export function Breadcrumbs({ outline, fileName }: Props) {
  const id = activeHeadingId.value;
  const path = id ? findPath(outline, id) ?? [] : [];

  return (
    <nav class="breadcrumbs" aria-label="Current section">
      {fileName && <span class="bc-file">{fileName}</span>}
      {path.map((node) => (
        <span key={node.id} class="bc-item">
          <span class="bc-sep">›</span>
          <span class="bc-text">{node.text}</span>
        </span>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Style**

Append to `src/client/styles/components.css`:

```css
.breadcrumbs { display: flex; align-items: center; gap: 6px; font-size: var(--fs-small); color: var(--fg-muted); overflow: hidden; }
.bc-file { color: var(--fg); font-weight: 500; }
.bc-sep { color: var(--fg-muted); margin: 0 4px; }
.bc-item { display: inline-flex; align-items: center; }
.bc-item:last-child .bc-text { color: var(--accent); font-weight: 500; }
```

- [ ] **Step 3: Commit**

```bash
git add src/client/components/Breadcrumbs.tsx src/client/styles/components.css
git commit -m "feat: breadcrumbs component reflecting current heading path"
```

---

### Task 24: Mermaid lazy-loader + link router lib

**Files:**
- Create: `src/client/lib/mermaid-loader.ts`
- Create: `src/client/lib/link-router.ts`

- [ ] **Step 1: Mermaid loader**

```ts
// src/client/lib/mermaid-loader.ts
let promise: Promise<typeof import('mermaid')> | null = null;

function load() {
  if (!promise) promise = import('mermaid');
  return promise;
}

let counter = 0;

export async function renderMermaidIn(root: HTMLElement): Promise<void> {
  const blocks = root.querySelectorAll<HTMLDivElement>('.mermaid-block');
  if (blocks.length === 0) return;

  const mod = await load();
  const mermaid = mod.default;
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });

  await Promise.all(
    Array.from(blocks).map(async (block) => {
      if (block.dataset.rendered) return;
      const source = decodeURIComponent(block.dataset.source ?? '');
      const id = `mermaid-${++counter}`;
      try {
        const { svg } = await mermaid.render(id, source);
        block.innerHTML = svg;
        block.dataset.rendered = 'true';
      } catch (err) {
        block.innerHTML = `<pre class="mermaid-error">${(err as Error).message}</pre>`;
      }
    }),
  );
}
```

- [ ] **Step 2: Link router**

```ts
// src/client/lib/link-router.ts
export function wireInternalLinks(
  root: HTMLElement,
  onNavigate: (relPath: string, hash: string) => void,
): void {
  root.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest('a[data-internal-link]');
    if (!target) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;

    ev.preventDefault();
    const internal = target.getAttribute('data-internal-link') ?? '';
    const hashIndex = internal.indexOf('#');
    const relPath = hashIndex >= 0 ? internal.slice(0, hashIndex) : internal;
    const hash = hashIndex >= 0 ? internal.slice(hashIndex) : '';
    onNavigate(relPath, hash);
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/client/lib/mermaid-loader.ts src/client/lib/link-router.ts
git commit -m "feat: mermaid lazy loader + internal link router"
```

---

### Task 25: useSSE hook + live reload wiring

**Files:**
- Create: `src/client/hooks/useSSE.ts`

- [ ] **Step 1: Implement**

```ts
// src/client/hooks/useSSE.ts
import { useEffect } from 'preact/hooks';
import type { WatchEvent } from '../../shared/types.js';

export function useSSE(onEvent: (e: WatchEvent) => void): void {
  useEffect(() => {
    const es = new EventSource('/api/watch');
    const handler = (msg: MessageEvent<string>) => {
      try {
        const data = JSON.parse(msg.data) as WatchEvent;
        onEvent(data);
      } catch { /* ignore malformed */ }
    };
    es.addEventListener('change', handler as EventListener);
    es.addEventListener('add', handler as EventListener);
    es.addEventListener('unlink', handler as EventListener);
    return () => es.close();
  }, [onEvent]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/hooks/useSSE.ts
git commit -m "feat: useSSE hook for live-reload events"
```

---

### Task 26: Wire everything in App.tsx

**Files:**
- Modify: `src/client/App.tsx`

- [ ] **Step 1: Replace `App.tsx` with full integration**

```tsx
// src/client/App.tsx
import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { useTheme } from './hooks/useTheme.js';
import { useTree, treeSignal } from './hooks/useTree.js';
import { fileSignal, fileLoading, fileError, loadFile } from './hooks/useFile.js';
import { useScrollSpy } from './hooks/useScrollSpy.js';
import { useSSE } from './hooks/useSSE.js';
import { FolderTree } from './components/FolderTree.js';
import { Content } from './components/Content.js';
import { Outline } from './components/Outline.js';
import { Breadcrumbs } from './components/Breadcrumbs.js';

function initialPath(): string | null {
  const sp = new URLSearchParams(window.location.search);
  return sp.get('file');
}

function pushPath(relPath: string, hash = ''): void {
  const url = `?file=${encodeURIComponent(relPath)}${hash}`;
  history.pushState({ file: relPath }, '', url);
}

export function App() {
  useTheme();
  const tree = useTree();
  const [currentPath, setCurrentPath] = useState<string | null>(initialPath());
  const mainRef = useRef<HTMLElement | null>(null);

  // First load: if no path and dir-mode, load the first md file
  useEffect(() => {
    const t = treeSignal.value;
    if (!t) return;
    if (t.root.rootKind === 'file') {
      setCurrentPath(t.root.rootRelPath);
      return;
    }
    if (currentPath === null) {
      const first = findFirstMd(t.tree);
      if (first) setCurrentPath(first);
    }
  }, [tree, currentPath]);

  useEffect(() => { void loadFile(currentPath); }, [currentPath]);

  // After file loads, restore hash anchor (if any)
  useEffect(() => {
    if (!fileSignal.value || !mainRef.current) return;
    const hash = window.location.hash.slice(1);
    if (hash) {
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        el?.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
    } else {
      mainRef.current.scrollTop = 0;
    }
  }, [fileSignal.value]);

  useScrollSpy(mainRef.current);

  // Live reload: re-fetch the current file on change
  const onWatch = useCallback((e: { kind: string; relPath: string }) => {
    if (e.relPath === currentPath) {
      const top = mainRef.current?.scrollTop ?? 0;
      void loadFile(currentPath).then(() => {
        requestAnimationFrame(() => {
          if (mainRef.current) mainRef.current.scrollTop = top;
        });
      });
    }
    // refresh tree on add/unlink
    if (e.kind === 'add' || e.kind === 'unlink') {
      void fetch('/api/tree').then((r) => r.json()).then((d) => (treeSignal.value = d));
    }
  }, [currentPath]);
  useSSE(onWatch);

  // browser back/forward
  useEffect(() => {
    const onPop = () => setCurrentPath(initialPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleSelect = (relPath: string) => {
    setCurrentPath(relPath);
    pushPath(relPath);
  };
  const handleInternalNav = (relPath: string, hash: string) => {
    setCurrentPath(relPath);
    pushPath(relPath, hash);
    if (hash) {
      requestAnimationFrame(() => {
        document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  };
  const handleJump = (id: string) => {
    history.replaceState(history.state, '', `#${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const file = fileSignal.value;
  const treeData = treeSignal.value;

  return (
    <div class="app-shell">
      <aside class="pane-tree">
        {treeData && (
          <FolderTree tree={treeData.tree} currentPath={currentPath} onSelect={handleSelect} />
        )}
      </aside>

      <header class="pane-header">
        <Breadcrumbs outline={file?.outline ?? []} fileName={file?.title ?? null} />
      </header>

      <main class="pane-main" ref={mainRef as never}>
        {fileLoading.value && <div class="status">Loading…</div>}
        {fileError.value && <div class="status status-error">Error: {fileError.value}</div>}
        {file && <Content file={file} onInternalNavigate={handleInternalNav} />}
      </main>

      <aside class="pane-outline">
        {file && <Outline nodes={file.outline} onJump={handleJump} />}
      </aside>
    </div>
  );
}

function findFirstMd(nodes: { type: string; relPath: string; isMarkdown?: boolean; children?: typeof nodes }[]): string | null {
  for (const n of nodes) {
    if (n.type === 'file' && n.isMarkdown) return n.relPath;
    if (n.type === 'dir' && n.children) {
      const sub = findFirstMd(n.children);
      if (sub) return sub;
    }
  }
  return null;
}
```

- [ ] **Step 2: Add status styles**

Append to `src/client/styles/components.css`:

```css
.status { color: var(--fg-muted); padding: 1em 0; }
.status-error { color: #c2410c; }
```

- [ ] **Step 3: Type-check client**

Run: `npx tsc -p tsconfig.client.json --noEmit`
Expected: zero errors.

- [ ] **Step 4: Build client**

Run: `npx vite build`
Expected: `dist/client/index.html` and assets produced.

- [ ] **Step 5: End-to-end smoke test**

```bash
mkdir -p /tmp/mdview-fixture/guides
cat > /tmp/mdview-fixture/README.md <<'MD'
# Hello mdview
This is the **README**.
MD
cat > /tmp/mdview-fixture/guides/intro.md <<'MD'
# Intro
A [link to README](../README.md) for testing.
## Section A
some text
## Section B
- [ ] todo
- [x] done
MD
node bin/mdview.mjs /tmp/mdview-fixture --no-open
# In another terminal: open http://127.0.0.1:7331/
```

Expected:
- Folder tree shows `README.md` and `guides/`.
- Click `intro.md` → renders. Click the README link → navigates inside the viewer.
- Edit `intro.md` in your editor and save → content updates, scroll preserved.
- Outline sidebar shows `Intro › Section A / Section B`; scroll changes the active highlight.

- [ ] **Step 6: Commit**

```bash
git add src/client/App.tsx src/client/styles/components.css
git commit -m "feat: full app integration with routing, live reload, scroll-spy"
```

---

## Phase 4: Polish & Verification

### Task 27: Visual polish pass

**Files:**
- Modify: as needed (`content.css`, `components.css`, `theme.css`)

- [ ] **Step 1: Manual pass**

Open a long doc (the spec, or another large md file you have). Walk the verification scenarios from the spec.

- [ ] **Step 2: Tweak**

Adjust:
- Heading rhythm — make sure the H1 → H2 → H3 hierarchy reads at a glance.
- Line height & paragraph spacing — should feel breathable, not cramped.
- Outline active highlight — must be unmissable but not jarring.
- Code blocks — test light + dark; verify Shiki dual-theme variables apply.
- Table of contents collapse animation feels smooth.

- [ ] **Step 3: Commit any tweaks**

```bash
git add src/client/styles
git commit -m "chore: visual polish pass — typography, color, spacing"
```

---

### Task 28: README + final verification against spec

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# mdview

Local markdown viewer with live reload, outline navigation, and folder browsing.

## Install

\`\`\`bash
npm install -g mdview
# or use npx:
npx mdview ./docs
\`\`\`

## Usage

\`\`\`bash
mdview <path>          # File or folder
mdview                 # Current directory
mdview --port 9000     # Custom port
mdview --no-open       # Don't auto-launch the browser
\`\`\`

## Features

- 3-pane layout: folder tree, content, collapsible outline
- Persistent outline with scroll-spy + breadcrumbs
- Live reload (preserves scroll position)
- Cross-file `[link](other.md)` navigation
- Light + dark themes following OS preference
- Server-side syntax highlighting (Shiki)
- Mermaid diagrams (lazy-loaded)

## Build from source

\`\`\`bash
npm install
npm run build
node bin/mdview.mjs <path>
\`\`\`
```

- [ ] **Step 2: Walk the spec verification scenarios**

Run through the 8 scenarios from the spec's "Verification" section. Fix any failures, commit fixes, re-test.

| # | Scenario | Pass criteria |
|---|---|---|
| 1 | Single-file mode | Edit & save propagates; scroll preserved |
| 2 | Folder mode | Folder tree + cross-file md links |
| 3 | Long-doc orientation | Outline + collapse + breadcrumb tracking |
| 4 | Code-heavy doc | Shiki dual-theme, multiple languages |
| 5 | Mermaid doc | Diagram renders, mermaid bundle skipped on docs without it |
| 6 | Theme follow | OS toggle → viewer follows |
| 7 | Anchor stability | Refresh on `#section` lands at the right heading |
| 8 | Visual / engagement check | Subjective — feels inviting |

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README for installation & usage"
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Final commit & tag**

```bash
git tag v0.1.0
```

---

## Self-review notes

- **Spec coverage check.** Each MUST goal in the product spec maps to tasks:
  - Goal 1 (typography & visual hierarchy) → Tasks 16, 17, 21, 27
  - Goal 2 (orientation in long docs) → Tasks 22, 23, 26 (URL hash)
  - Goal 3 (folder navigation) → Tasks 9, 12, 20, 24 (link router), 26
  - Goal 4 (live reload) → Tasks 13, 14, 25, 26
  - Goal 5 (engaging visual design, color) → Tasks 17, 21, 22, 27
  - Goal 6 (invisible when not in use) → Task 15 (CLI lifecycle, SIGINT/SIGTERM)
- **Non-goals respected.** No editor, no auth, no static export, no plugin API, no search, no math, no remote fetching.
- **Lazy-loading honored.** Mermaid is dynamic-imported (Task 24); Shiki runs only on the server (no client highlighter bundle).
- **TDD where it earns its keep.** Markdown rendering, outline extraction, frontmatter, link rewriting, path safety, folder walking, scroll-spy logic all have unit tests. UI components verified via manual scenarios in Task 27/28 — pragmatic for a tool whose value is largely visual/experiential.
- **Type consistency.** `RenderedFile`, `OutlineNode`, `TreeNode`, `RootInfo`, `WatchEvent` are defined once in `src/shared/types.ts` and imported everywhere.
