import { handle, markdownResponse, NotFoundError } from "@/lib/api";
import { getPlaybookVersion, latestPlaybook } from "@/lib/services/playbook";

export const GET = handle(async (req: Request) => {
  const v = new URL(req.url).searchParams.get("v");
  const p = v ? await getPlaybookVersion(v) : await latestPlaybook();
  if (!p) throw new NotFoundError("Playbook version not found");
  return markdownResponse(p.contentMd, `ai-engineering-playbook-v${p.version}.md`);
});
