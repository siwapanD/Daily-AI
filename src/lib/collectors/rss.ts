import { XMLParser } from "fast-xml-parser";
import { safeFetch } from "../security/safe-fetch";
import type { Collector } from "./types";
import type { RawItem } from "../pipeline/normalize";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
  // Limit entity expansion abuse.
  isArray: (name) => ["item", "entry", "link", "category"].includes(name),
});

type Node = Record<string, unknown> | string | undefined;

function text(n: unknown): string {
  if (n == null) return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return text(n[0]);
  if (typeof n === "object") {
    const o = n as Record<string, unknown>;
    return text(o["#text"] ?? o["__cdata"] ?? "");
  }
  return "";
}

function atomLink(links: unknown): string {
  const arr = (Array.isArray(links) ? links : [links]) as Node[];
  const pick =
    arr.find((l) => typeof l === "object" && (l["@_rel"] === "alternate" || !l["@_rel"])) ?? arr[0];
  if (typeof pick === "string") return pick;
  return (pick?.["@_href"] as string) ?? text(pick);
}

function date(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Parse RSS 2.0, RSS 1.0 (RDF) and Atom documents. */
export function parseFeed(xml: string, limit = 30): RawItem[] {
  const doc = parser.parse(xml);
  const channel = doc.rss?.channel ?? doc["rdf:RDF"]?.channel;
  const rssItems: Record<string, unknown>[] = doc.rss?.channel?.item ?? doc["rdf:RDF"]?.item ?? channel?.item ?? [];
  if (rssItems.length) {
    return rssItems.slice(0, limit).map((it) => ({
      url: text(it.link) || text(it.guid),
      title: text(it.title),
      content: text(it["content:encoded"]) || text(it.description),
      author: text(it["dc:creator"]) || text(it.author) || null,
      publishedAt: date(text(it.pubDate) || text(it["dc:date"])),
    }));
  }
  const entries: Record<string, unknown>[] = doc.feed?.entry ?? [];
  return entries.slice(0, limit).map((e) => ({
    url: atomLink(e.link),
    title: text(e.title),
    content: text(e.content) || text(e.summary),
    author: text((e.author as Record<string, unknown>)?.name) || null,
    publishedAt: date(text(e.published) || text(e.updated)),
  }));
}

export const rssCollector: Collector = async (source) => {
  const res = await safeFetch(source.url, {
    headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" },
  });
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  const limit = Number((source.config as { limit?: number }).limit) || 30;
  const items = parseFeed(res.text, limit).filter((i) => i.url && i.title);
  return { items };
};
