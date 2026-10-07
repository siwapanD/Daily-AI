import { canonicalizeUrl } from "../security/url";
import { sha256 } from "../security/crypto";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Reduce HTML to readable plain text (no markup is ever stored). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export function normalizeTitle(title: string): string {
  return decodeEntities(title)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .trim();
}

export function titleHash(title: string): string {
  return sha256(normalizeTitle(title));
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

export interface RawItem {
  url: string;
  title: string;
  content?: string | null;
  author?: string | null;
  publishedAt?: Date | null;
}

export interface NormalizedItem {
  url: string;
  canonicalUrl: string;
  title: string;
  titleHash: string;
  content: string;
  excerpt: string;
  contentHash: string;
  author: string | null;
  publishedAt: Date | null;
}

export function normalizeItem(raw: RawItem): NormalizedItem | null {
  const title = truncate(htmlToText(raw.title ?? "").replace(/\s+/g, " "), 300);
  if (!title || !raw.url) return null;
  const content = truncate(htmlToText(raw.content ?? ""), 20000);
  const published = raw.publishedAt && !isNaN(raw.publishedAt.getTime()) ? raw.publishedAt : null;
  return {
    url: raw.url.trim(),
    canonicalUrl: canonicalizeUrl(raw.url),
    title,
    titleHash: titleHash(title),
    content,
    excerpt: truncate(content.replace(/\s+/g, " "), 400),
    contentHash: sha256(content),
    author: raw.author ? truncate(htmlToText(raw.author), 120) : null,
    // Future dates (bad feeds) are clamped to now.
    publishedAt: published && published.getTime() > Date.now() + 86400000 ? new Date() : published,
  };
}
