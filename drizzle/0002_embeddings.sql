CREATE TABLE "embeddings" (
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"model" text NOT NULL,
	"dims" integer NOT NULL,
	"vector" real[] NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "embeddings_entity_type_entity_id_pk" PRIMARY KEY("entity_type","entity_id")
);
--> statement-breakpoint
CREATE INDEX "embeddings_model_idx" ON "embeddings" USING btree ("model");