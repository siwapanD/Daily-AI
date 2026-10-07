import { safeFetch } from "../security/safe-fetch";
import { htmlToText, decodeEntities } from "../pipeline/normalize";
import { sha256 } from "../security/crypto";
import type { Collector } from "./types";

export interface PageInfo {
  url: string;
  title: string;
  description: string;
  text: string;
  publishedAt: Date | null;
}

function meta(html: string, name: string): string {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "") : "";
}

export function extractPage(html: string, url: string): PageInfo {
  const title =
    meta(html, "og:title") || decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "") || url;
  const description = meta(html, "og:description") || meta(html, "description");
  const main = html.match(/<(main|article)[\s\S]*?<\/\1>/i)?.[0] ?? html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html;
  const published = meta(html, "article:published_time");
  const d = published ? new Date(published) : null;
  return {
    url,
    title: title.replace(/\s+/g, " ").trim(),
    description,
    text: htmlToText(main),
    publishedAt: d && !isNaN(d.getTime()) ? d : null,
  };
}

export async function fetchPage(url: string): Promise<PageInfo> {
  const res = await safeFetch(url, { headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" } });
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (type && !/html|text\/plain|xml/.test(type)) throw new Error(`Unsupported content type: ${type}`);
  return extractPage(res.text, res.url);
}

/**
 * Monitors a page (docs/changelog). Emits one item each time the page text changes.
 * The first fetch records a baseline and emits the current page.
 */
export const webCollector: Collector = async (source) => {
  const page = await fetchPage(source.url);
  const hash = sha256(page.text);
  const prev = (source.state as { hash?: string }).hash;
  if (prev === hash) return { items: [], state: source.state };
  const rev = hash.slice(0, 10);
  return {
    items: [
      {
        url: `${source.url}#rev-${rev}`,
        title: prev ? `Updated: ${page.title}` : page.title,
        content: [page.description, page.text].filter(Boolean).join("\n\n"),
        publishedAt: new Date(),
      },
    ],
    state: { ...source.state, hash, lastChangeAt: new Date().toISOString() },
  };
};
