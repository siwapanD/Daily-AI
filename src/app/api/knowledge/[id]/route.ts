import { handle, json, readJson, idParam, NotFoundError } from "@/lib/api";
import { getKnowledge, updateKnowledge, deleteKnowledge } from "@/lib/services/knowledge";
import { knowledgeBody } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const k = await getKnowledge(idParam.parse((await params).id));
  if (!k) throw new NotFoundError("Knowledge item not found");
  return json(k);
});
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const id = idParam.parse((await params).id);
  await updateKnowledge(id, knowledgeBody.partial().parse(await readJson(req)));
  return json(await getKnowledge(id));
});
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await deleteKnowledge(idParam.parse((await params).id));
  return json({ ok: true });
});
