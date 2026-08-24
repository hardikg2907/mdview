// src/shared/types.ts

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface OutlineNode {
  id: string;          // anchor id (slug)
  text: string;        // heading text
  level: HeadingLevel;
  children: OutlineNode[];
}

export interface RenderedFile {
  relPath: string;             // workspace-scoped `<rootId>/<path>`, forward slashes
  html: string;                // rendered body HTML (no <html>, no <head>)
  outline: OutlineNode[];
  frontmatter: Record<string, unknown> | null;
  title: string | null;        // extracted from H1 or frontmatter.title
  lastModified: number;        // file mtime, milliseconds since epoch
}

export interface TreeNode {
  name: string;
  /** Workspace-scoped: `<rootId>/<path within the root>`. */
  relPath: string;
  type: 'file' | 'dir';
  children?: TreeNode[];       // dirs only
  isMarkdown?: boolean;        // files: true if .md/.markdown
}

/**
 * One folder the server is serving. Several can be open at once.
 *
 * `id` is also the first segment of every relPath belonging to this root, which
 * is what keeps paths unambiguous across roots while leaving them a single
 * opaque string on the wire — see src/server/workspace.ts.
 *
 * Absolute paths are deliberately absent: the SPA has no use for them, and
 * anything that can reach the port would otherwise be handed a map of the
 * user's disk.
 */
export interface WorkspaceRoot {
  id: string;
  name: string;                // display label, defaults to the basename
  kind: 'file' | 'dir';
  filePath: string;            // '' for a dir root; the file's path within the root for a file root
}

export type WatchEvent =
  | { kind: 'change'; relPath: string }
  | { kind: 'add'; relPath: string }
  | { kind: 'unlink'; relPath: string }
  | { kind: 'config'; relPath: string }
  // The set of open roots changed. Carries no path — the client refetches the
  // tree, which is the only thing that can have changed.
  | { kind: 'workspace' };

export type Palette = 'classic' | 'paper' | 'nord' | 'solarized' | 'high-contrast';
export const PALETTES: readonly Palette[] = ['classic', 'paper', 'nord', 'solarized', 'high-contrast'];

export type FontFamily = 'serif' | 'sans' | 'mono';

export interface ProjectConfig {
  palette?: Palette;
  fontFamily?: FontFamily;
  lineWidth?: string;
  defaultCollapsed?: {
    tree?: boolean;
    outline?: boolean;
  };
  ignore?: string[];
}
