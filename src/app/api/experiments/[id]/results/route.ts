import { z } from "zod";
import { handle, json, readJson, idParam, NotFoundError } from "@/lib/api";
import { addResult, getExperiment } from "@/lib/services/experiments";

const n = z.number().finite().nullish();
const body = z.object({
  variant: z.string().trim().min(1).max(60),
  timeMinutes: n, tokens: z.number().int().nullish(), costUsd: n, quality: n, accuracy: n, testPassRate: n,
  humanInterventions: z.number().int().nullish(), retries: z.number().int().nullish(),
  notes: z.string().max(2000).nullish(),
  extra: z.record(z.string(), z.number()).optional(),
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const experimentId = idParam.parse((await params).id);
  if (!(await getExperiment(experimentId))) throw new NotFoundError("Experiment not found");
  return json(await addResult({ ...body.parse(await readJson(req)), experimentId }), 201);
});
