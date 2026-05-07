import { mkdir, readFile, writeFile, copyFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { walkFolder } from '../server/fs/tree.js';
import { resolveSafePath } from '../server/fs/resolve.js';
import { renderMarkdown } from '../render/markdown.js';
import { extractOutline } from '../render/outline.js';
import { parseFrontmatter } from '../render/frontmatter.js';
import { tagInternalLinks, rewriteImageSrc } from '../render/links.js';
import { renderPage, relativeHref } from './template.js';
import { renderMathServerSide } from './math-ssr.js';
import { flattenMdRelPaths, MD_EXT_RE } from '../shared/tree-utils.js';
import { formatRelativeTime } from '../shared/relative-time.js';
import type { RootInfo, TreeNode } from '../shared/types.js';

interface ExportOpts {
  rootAbsPath: string;
  rootInfo: RootInfo;
  clientDir: string;
  outDir: string;
}

const PARALLEL = 8;

function collectImageAssets(html: string): string[] {
  const out: string[] = [];
  const re = /<img\s+[^>]*src="\/__asset\/([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]!);
  return out;
}

function rewriteInternalHrefs(html: string, currentRelPath: string): string {
  return html.replace(
    /<a\s+([^>]*?)href="([^"]*?)"\s+data-internal-link="([^"#]+)(#[^"]*)?"([^>]*)>/g,
    (_full, pre, _existingHref, target, hash, post) => {
      const targetHtml = target.replace(MD_EXT_RE, '.html');
      const href = relativeHref(currentRelPath, targetHtml) + (hash ?? '');
      return `<a ${pre}href="${href}"${post}>`;
    },
  );
}

function rewriteAssetUrls(html: string, currentRelPath: string): string {
  return html.replace(
    /<img\s+([^>]*?)src="\/__asset\/([^"]+)"([^>]*)>/g,
    (_full, pre, asset, post) => {
      const href = relativeHref(currentRelPath, `__asset/${asset}`);
      return `<img ${pre}src="${href}"${post}>`;
    },
  );
}

async function copyClientAssets(clientDir: string, outDir: string): Promise<string[]> {
  const fromAssets = path.join(clientDir, 'assets');
  const entries = await readdir(fromAssets).catch(() => [] as string[]);
  const toAssets = path.join(outDir, 'assets');
  await mkdir(toAssets, { recursive: true });
  const cssFiles: string[] = [];
  await Promise.all(
    entries
      .filter((f) => /\.(css|woff|woff2|ttf)$/i.test(f))
      .map(async (f) => {
        await copyFile(path.join(fromAssets, f), path.join(toAssets, f));
        if (f.endsWith('.css')) cssFiles.push(f);
      }),
  );
  cssFiles.sort((a, b) => {
    const ai = a.startsWith('index') ? 0 : 1;
    const bi = b.startsWith('index') ? 0 : 1;
    return ai - bi;
  });
  return cssFiles;
}

interface PageJob {
  relPath: string;
  outAbs: string;
  pageHtml: string;
  assets: string[];
}

async function buildPage(
  rootAbsPath: string,
  rootInfo: RootInfo,
  outDir: string,
  cssFiles: string[],
  tree: TreeNode[],
  relPath: string,
): Promise<PageJob | null> {
  let absPath: string;
  try {
    absPath = resolveSafePath(rootAbsPath, relPath);
  } catch (err) {
    console.warn(`Skipping ${relPath}: ${(err as Error).message}`);
    return null;
  }
  let raw: string;
  let mtimeMs: number;
  try {
    const [content, st] = await Promise.all([readFile(absPath, 'utf8'), stat(absPath)]);
    raw = content;
    mtimeMs = st.mtimeMs;
  } catch (err) {
    console.warn(`Skipping ${relPath}: ${(err as Error).message}`);
    return null;
  }
  const { data, body } = parseFrontmatter(raw);
  const { html: rawHtml, tokens } = await renderMarkdown(body);
  let html = rewriteImageSrc(tagInternalLinks(rawHtml, relPath), relPath);
  html = renderMathServerSide(html);
  const assets = collectImageAssets(html);
  html = rewriteInternalHrefs(html, relPath);
  html = rewriteAssetUrls(html, relPath);

  const outline = extractOutline(tokens);
  const title =
    (typeof data?.title === 'string' ? data.title : null) ?? outline[0]?.text ?? relPath;

  const pageHtml = renderPage({
    pageTitle: title,
    currentRelPath: relPath,
    bodyHtml: html,
    outline,
    tree,
    cssAssets: cssFiles,
    rootName: rootInfo.rootName,
    updatedLabel: `Updated ${formatRelativeTime(mtimeMs)}`,
  });

  return {
    relPath,
    outAbs: path.join(outDir, relPath.replace(MD_EXT_RE, '.html')),
    pageHtml,
    assets,
  };
}

async function runWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

export async function runExport(opts: ExportOpts): Promise<void> {
  const { rootAbsPath, rootInfo, clientDir, outDir } = opts;
  await mkdir(outDir, { recursive: true });

  const tree = await walkFolder(rootAbsPath);
  const mdFiles = flattenMdRelPaths(tree);
  if (mdFiles.length === 0) {
    console.warn('mdview export: no markdown files found in target directory.');
  }

  const cssFiles = await copyClientAssets(clientDir, outDir);

  const jobs = await runWithLimit(mdFiles, PARALLEL, (relPath) =>
    buildPage(rootAbsPath, rootInfo, outDir, cssFiles, tree, relPath),
  );

  const assetsToCopy = new Set<string>();
  await Promise.all(
    jobs.filter((j): j is PageJob => j !== null).map(async (job) => {
      job.assets.forEach((a) => assetsToCopy.add(a));
      await mkdir(path.dirname(job.outAbs), { recursive: true });
      await writeFile(job.outAbs, job.pageHtml, 'utf8');
    }),
  );

  if (mdFiles.length > 0) {
    const firstHtml = mdFiles[0]!.replace(MD_EXT_RE, '.html');
    const indexPath = path.join(outDir, 'index.html');
    const redirect = `<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${firstHtml}"><link rel="canonical" href="${firstHtml}"><title>Redirecting…</title><a href="${firstHtml}">Continue</a>`;
    await writeFile(indexPath, redirect, 'utf8');
  }

  if (assetsToCopy.size > 0) {
    const outAssetsDir = path.join(outDir, '__asset');
    await mkdir(outAssetsDir, { recursive: true });
    await Promise.all(
      Array.from(assetsToCopy).map(async (rel) => {
        let abs: string;
        try {
          abs = resolveSafePath(rootAbsPath, rel);
        } catch {
          return;
        }
        const dest = path.join(outAssetsDir, rel);
        await mkdir(path.dirname(dest), { recursive: true });
        try {
          await copyFile(abs, dest);
        } catch (err) {
          console.warn(`Skipping asset ${rel}: ${(err as Error).message}`);
        }
      }),
    );
  }

  const manifest = {
    rootName: rootInfo.rootName,
    pages: mdFiles.map((p) => p.replace(MD_EXT_RE, '.html')),
    generated: new Date().toISOString(),
  };
  await writeFile(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
}
