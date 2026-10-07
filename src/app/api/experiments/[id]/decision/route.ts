import { z } from "zod";
import { handle, json, readJson, idParam } from "@/lib/api";
import { decideExperiment, getExperiment } from "@/lib/services/experiments";
import { EXPERIMENT_DECISIONS } from "@/lib/constants";

/** { "decision": "ADOPT"|"WATCH"|"REJECT"|"RETEST", "conclusion": "...", "playbookRule"?: "..." } */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = idParam.parse((await params).id);
  const d = z.object({
    decision: z.enum(EXPERIMENT_DECISIONS), conclusion: z.string().max(5000).default(""), playbookRule: z.string().max(500).optional(),
  }).parse(await readJson(req));
  const r = await decideExperiment(id, d.decision, d.conclusion, d.playbookRule);
  return json({ ...r, experiment: await getExperiment(id) });
});
