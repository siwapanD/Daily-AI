import { handle, json, readJson, idParam, NotFoundError } from "@/lib/api";
import { getSource, updateSource, deleteSource } from "@/lib/services/discovery";
import { sourceBody } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const s = await getSource(idParam.parse((await params).id));
  if (!s) throw new NotFoundError("Source not found");
  return json(s);
});
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const id = idParam.parse((await params).id);
  await updateSource(id, sourceBody.partial().parse(await readJson(req)));
  return json(await getSource(id));
});
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await deleteSource(idParam.parse((await params).id));
  return json({ ok: true });
});
