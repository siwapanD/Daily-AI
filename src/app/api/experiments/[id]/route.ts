import { handle, json, readJson, idParam, NotFoundError } from "@/lib/api";
import { getExperiment, updateExperiment, deleteExperiment, compareResults } from "@/lib/services/experiments";
import { experimentBody } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const e = await getExperiment(idParam.parse((await params).id));
  if (!e) throw new NotFoundError("Experiment not found");
  return json({ ...e, comparison: compareResults(e.results) });
});
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const id = idParam.parse((await params).id);
  await updateExperiment(id, experimentBody.partial().parse(await readJson(req)));
  return json(await getExperiment(id));
});
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await deleteExperiment(idParam.parse((await params).id));
  return json({ ok: true });
});
