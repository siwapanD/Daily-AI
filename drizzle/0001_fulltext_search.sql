-- Full-text search (P1). 'simple' config: language-agnostic (English + Thai titles), no stemming.
ALTER TABLE "articles" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple'::regconfig, coalesce("title", '')), 'A') ||
  setweight(to_tsvector('simple'::regconfig, coalesce("summary", '') || ' ' || coalesce("excerpt", '')), 'B') ||
  setweight(to_tsvector('simple'::regconfig, left(coalesce("content", ''), 20000)), 'C')
) STORED;
--> statement-breakpoint
CREATE INDEX "articles_search_idx" ON "articles" USING gin ("search");
--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "search" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple'::regconfig, coalesce("title", '')), 'A') ||
  setweight(to_tsvector('simple'::regconfig, coalesce("summary", '')), 'B') ||
  setweight(to_tsvector('simple'::regconfig, left(coalesce("content_md", ''), 50000)), 'C')
) STORED;
--> statement-breakpoint
CREATE INDEX "knowledge_items_search_idx" ON "knowledge_items" USING gin ("search");
