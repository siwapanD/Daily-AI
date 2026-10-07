import { z } from "zod";
import { handle, json, readJson, idParam, limitRequest, NotFoundError } from "@/lib/api";
import { getArticle, learnArticle } from "@/lib/services/knowledge";
import { setUserAction } from "@/lib/services/discoveries";
import { analyzeOne } from "@/lib/services/analysis";
import { createExperimentFromArticle } from "@/lib/services/experiments";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const row = await getArticle(idParam.parse((await params).id));
  if (!row) throw new NotFoundError("Discovery not found");
  return json(row);
});

/** { "action": "learn" | "experiment" | "watch" | "ignore" | "analyze" | "clear" } */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const id = idParam.parse((await params).id);
  const { action } = z.object({ action: z.enum(["learn", "experiment", "watch", "ignore", "analyze", "clear"]) }).parse(await readJson(req));
  if (!(await getArticle(id))) throw new NotFoundError("Discovery not found");
  if (action === "learn") { limitRequest(req, "llm", 15); return json(await learnArticle(id)); }
  if (action === "experiment") { limitRequest(req, "llm", 15); return json(await createExperimentFromArticle(id), 201); }
  if (action === "analyze") { limitRequest(req, "llm", 15); await analyzeOne(id); return json(await getArticle(id)); }
  await setUserAction(id, action === "clear" ? null : action);
  return json({ ok: true });
});
