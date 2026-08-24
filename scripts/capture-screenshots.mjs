#!/usr/bin/env node
/**
 * Capture marketing screenshots of mdview rendering `test-fixtures/demo.md`.
 *
 * Spawns mdview as a subprocess against the demo doc, opens headless Chromium
 * via Playwright, sets palette / mode state through localStorage + keyboard
 * shortcuts, and writes PNGs into `docs/screenshots/`.
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs
 *
 * Prereqs:
 *   - Build first: `npm run build`
 *   - Playwright installed: `npm install --save-dev playwright`
 *     (or globally) followed by `npx playwright install chromium`.
 *
 * Output:
 *   docs/screenshots/hero.png       — classic palette, default view
 *   docs/screenshots/nord.png       — nord palette
 *   docs/screenshots/focus-mode.png — focus mode on, scrolled into body
 *   docs/screenshots/search.png     — in-doc search open with a query
 *   docs/screenshots/collapsed.png  — one section folded via chevron
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 7333;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OUT_DIR = resolve(ROOT, 'docs/screenshots');
const DEMO_PATH = resolve(ROOT, 'test-fixtures/demo.md');
const BIN = resolve(ROOT, 'bin/mdview.mjs');

let playwright;
try {
  playwright = await import('playwright');
} catch {
  console.error('\n  Playwright is not installed.\n');
  console.error('  Install with one of:');
  console.error('    npm install --save-dev playwright && npx playwright install chromium');
  console.error('    npm install -g playwright          && playwright install chromium\n');
  process.exit(1);
}
const { chromium } = playwright;

async function waitForReady(url, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/tree`);
      if (res.ok) return;
    } catch {}
    await wait(150);
  }
  throw new Error(`mdview did not become ready at ${url} within ${timeoutMs}ms`);
}

function startServer() {
  console.log(`▸ starting mdview on ${BASE_URL}`);
  const proc = spawn('node', [BIN, DEMO_PATH, '--port', String(PORT), '--no-open'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    cwd: ROOT,
  });
  proc.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`mdview exited with code ${code}`);
    }
  });
  return proc;
}

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
  // Lazy chunks (mermaid, KaTeX) finish painting after networkidle on some runs.
  await page.waitForTimeout(1200);
}

async function captureStates(browser) {
  await mkdir(OUT_DIR, { recursive: true });
  const baseContext = {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  };

  const shot = async (name, configure) => {
    const context = await browser.newContext(baseContext);
    if (configure?.initLocalStorage) {
      await context.addInitScript((entries) => {
        for (const [k, v] of entries) localStorage.setItem(k, v);
      }, configure.initLocalStorage);
    }
    const page = await context.newPage();
    await page.goto(BASE_URL);
    await settle(page);
    if (configure?.afterLoad) await configure.afterLoad(page);
    const file = resolve(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`  ✓ ${name}.png`);
    await context.close();
  };

  await shot('hero');

  await shot('nord', {
    // Persisted-signal stores JSON-encoded strings, so the value itself
    // includes the quotation marks.
    initLocalStorage: [['mdview-palette', '"nord"']],
  });

  await shot('focus-mode', {
    afterLoad: async (page) => {
      await page.keyboard.press('f');
      await page.evaluate(() => {
        const el = document.querySelector('.pane-main');
        if (el) el.scrollBy({ top: 600 });
      });
      await page.waitForTimeout(500);
    },
  });

  await shot('search', {
    afterLoad: async (page) => {
      await page.keyboard.press('/');
      await page.waitForTimeout(200);
      await page.keyboard.type('typography');
      await page.waitForTimeout(500);
    },
  });

  await shot('collapsed', {
    afterLoad: async (page) => {
      // Fold the first user-visible section.
      await page.evaluate(() => {
        const btn = document.querySelector('.markdown-content .section-toggle');
        if (btn) btn.click();
      });
      await page.waitForTimeout(400);
    },
  });
}

const server = startServer();
let cleanup = () => {
  server.kill('SIGINT');
};
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

try {
  await waitForReady(BASE_URL);
  console.log('▸ launching headless chromium');
  const browser = await chromium.launch();
  try {
    await captureStates(browser);
  } finally {
    await browser.close();
  }
  console.log(`\n✓ screenshots written to ${OUT_DIR}\n`);
} catch (err) {
  console.error('\n✗ capture failed:', err.message);
  process.exitCode = 1;
} finally {
  cleanup();
  await wait(300);
}
