import { z } from "zod";
import { experimentBody } from "@/lib/schemas";
import { handle, json, readJson, limitRequest } from "@/lib/api";
import { listExperiments, createExperiment, createExperimentFromArticle } from "@/lib/services/experiments";


export const GET = handle(async () => json(await listExperiments()));

/** Body: experiment fields, or { "articleId": 123 } to let AI draft it from a discovery. */
export const POST = handle(async (req: Request) => {
  const body = await readJson(req);
  const fromArticle = z.object({ articleId: z.number().int().positive() }).safeParse(body);
  if (fromArticle.success) {
    limitRequest(req, "llm", 15);
    return json(await createExperimentFromArticle(fromArticle.data.articleId), 201);
  }
  return json(await createExperiment(experimentBody.parse(body)), 201);
});
