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
