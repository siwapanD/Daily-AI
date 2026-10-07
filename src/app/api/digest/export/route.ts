import { z } from "zod";
import { handle, markdownResponse, NotFoundError } from "@/lib/api";
import { getDigest } from "@/lib/services/digest";

export const GET = handle(async (req: Request) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().parse(new URL(req.url).searchParams.get("date") ?? undefined);
  const d = await getDigest(date);
  if (!d) throw new NotFoundError("No digest");
  return markdownResponse(d.contentMd, `daily-ai-${d.digestDate}.md`);
});
