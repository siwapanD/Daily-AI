import { handle, json, readJson, idParam, limitRequest, NotFoundError } from "@/lib/api";
import { getExperiment } from "@/lib/services/experiments";
import { saveBenchmarkConfig, runBenchmark } from "@/lib/services/benchmark";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 600;

/** POST { config?: BenchmarkConfig } → saves the config (if given) and runs the benchmark. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const id = idParam.parse((await params).id);
  if (!(await getExperiment(id))) throw new NotFoundError("Experiment not found");
  limitRequest(req, "benchmark", 3);
  const body = (await readJson(req)) as { config?: unknown };
  if (body.config) await saveBenchmarkConfig(id, body.config);
  return json(await runBenchmark(id));
});
