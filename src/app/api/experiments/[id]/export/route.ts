import { handle, idParam, markdownResponse, NotFoundError } from "@/lib/api";
import { getExperiment, experimentToMarkdown } from "@/lib/services/experiments";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const e = await getExperiment(idParam.parse((await params).id));
  if (!e) throw new NotFoundError("Experiment not found");
  return markdownResponse(experimentToMarkdown(e), `${e.code}.md`);
});
