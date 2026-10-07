import { handle, idParam, markdownResponse, NotFoundError } from "@/lib/api";
import { getKnowledge, knowledgeToMarkdown } from "@/lib/services/knowledge";
import { slugify } from "@/lib/pipeline/technologies";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const k = await getKnowledge(idParam.parse((await params).id));
  if (!k) throw new NotFoundError("Knowledge item not found");
  return markdownResponse(knowledgeToMarkdown(k), `${slugify(k.title)}.md`);
});
