import { sql, type SQL } from "drizzle-orm";

/**
 * Full-text search on the generated `search` tsvector columns (migration 0001).
 * `websearch_to_tsquery` accepts user syntax: quotes for phrases, OR, and -exclusions.
 */
type FtsTable = "articles" | "knowledge_items";

const col = (table: FtsTable) => sql.raw(`"${table}"."search"`);

export function ftsMatch(table: FtsTable, q: string): SQL {
  return sql`${col(table)} @@ websearch_to_tsquery('simple', ${q})`;
}

export function ftsRank(table: FtsTable, q: string): SQL<number> {
  return sql<number>`ts_rank(${col(table)}, websearch_to_tsquery('simple', ${q}))`;
}
