import { knowledgeBody } from "@/lib/schemas";
import { handle, json, readJson } from "@/lib/api";
import { listKnowledge, createKnowledge } from "@/lib/services/knowledge";


export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  return json(await listKnowledge({
    q: sp.get("q") ?? undefined, area: sp.get("area") ?? undefined, status: sp.get("status") ?? undefined, tag: sp.get("tag") ?? undefined,
  }));
});
export const POST = handle(async (req: Request) => json(await createKnowledge(knowledgeBody.parse(await readJson(req))), 201));
