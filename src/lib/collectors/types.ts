import type { RawItem } from "../pipeline/normalize";
import type { Source } from "../db/schema";

export interface CollectResult {
  items: RawItem[];
  /** Updated source state to persist (e.g. web page content hash). */
  state?: Record<string, unknown>;
}

export type Collector = (source: Pick<Source, "id" | "name" | "type" | "url" | "config" | "state">) => Promise<CollectResult>;
