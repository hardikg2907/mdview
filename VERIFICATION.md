# Manual verification scenarios

Walk through these against `test-fixtures/showcase.md` after any meaningful change. Subjective — meant for human eyes, not CI.

## Setup

```bash
npm install && npm run build
node bin/mdview.mjs ./test-fixtures --no-open
# open http://127.0.0.1:7331/ in a browser
```

## Scenarios

### 1. Single-file mode
```bash
node bin/mdview.mjs ./test-fixtures/showcase.md --no-open
```
- Folder tree shows one item (the file).
- Outline pulls headings from the doc.
- Edit the file in another editor, save → view updates, scroll position preserved.

### 2. Folder mode
- Folder tree shows nested structure (`assets/`, `linked-doc.md`, `showcase.md`).
- Click `linked-doc.md` → renders in the viewer (no full page reload).
- Internal `[link](./linked-doc.md)` inside `showcase.md` navigates same way.
- Internal `[anchor](#some-id)` jumps within the doc.

### 3. Long-doc orientation
- Outline lists every heading; depth visible via indentation + decay.
- Scroll to a deep subsection → breadcrumb path updates, outline highlights the right item.
- Click any outline item → smooth scrolls there + active highlight pins on the right one immediately.
- Click any breadcrumb segment → smooth scroll to that level.

### 4. Code blocks
- Six languages (TypeScript, Python, Go, JSON, bash, SQL) render with Shiki dual-theme highlighting.
- Hover a code block → "Copy" button appears top-right.
- Click "Copy" → clipboard receives the code; button briefly says "Copied".

### 5. Mermaid
- Mermaid block renders as an SVG diagram.
- Open DevTools → Network: `mermaid.core` chunk only loads on a page that contains a mermaid block.

### 6. Themes
- Theme toggle (sun/moon icon, header right) flips light/dark instantly.
- Reload — chosen theme persists.
- `⌘\` shortcut also toggles.

### 7. Anchors
- Hover any heading → `#` appears on the right.
- Click it → URL copied to clipboard.
- Paste URL into a new tab → lands at exactly that section.

### 8. Search
- Press `/` or `⌘F` → search bar opens, input auto-focused.
- Type a word → matches highlight in content; counter shows "1 / N".
- Press `Enter` → next match (smooth scrolls into view).
- Press `Esc` → search closes, highlights cleared.

### 9. Quick switcher
- Press `⌘P` → palette opens.
- Type a fragment → results filter, accent-colored letters show what matched.
- Arrow keys navigate; Enter opens; Esc closes.
- Current file shows a "current" tag.

### 10. Images & lightbox
- `wave.svg` and `star.svg` render inline at their relative paths.
- Hover an image → cursor becomes `zoom-in`.
- Click → fullscreen lightbox with backdrop blur.
- Esc or click outside → closes.

### 11. External links
- External links (e.g. https://vercel.com) get a small `↗` icon after the link text.
- Click → opens in new tab.
- Hover → icon brightens to accent color and lifts slightly.

### 12. Task lists
- `- [x] done` → custom-styled accent-filled checkbox with white check.
- `- [ ] todo` → hollow checkbox.
- No bullet point in front of checkboxes.

### 13. Live reload
- Edit `showcase.md` in another editor (add a heading or change a paragraph).
- Save — view re-renders within ~100ms.
- Scroll position is preserved.

### 14. Sidebar collapse
- Click the panel-left icon (header left) → tree collapses to a thin "FILES" rail; click rail to re-expand.
- Same on the right with the panel-right icon and outline.
- Reload — collapse state persists.

### 15. Shortcuts panel
- Press `?` (or click the keyboard icon in the header) → modal lists all shortcuts in three groups (Navigation / Find / View).
- Esc or click-outside closes.

## Tests

```bash
npm test            # 34 vitest unit tests
npm run typecheck   # both tsconfigs clean
```

## Known follow-ups

See [`TODO.md`](TODO.md) for the phase 2/3/4 roadmap.
