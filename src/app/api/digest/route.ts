import { z } from "zod";
import { handle, json, limitRequest, NotFoundError } from "@/lib/api";
import { getDigest, generateDigest, listDigests } from "@/lib/services/digest";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

/** GET /api/digest?date=YYYY-MM-DD (latest when omitted), ?list=1 for history. */
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  if (sp.get("list")) return json(await listDigests());
  const d = await getDigest(date.parse(sp.get("date") ?? undefined));
  if (!d) throw new NotFoundError("No digest");
  return json(d);
});

export const POST = handle(async (req: Request) => {
  limitRequest(req, "job", 10);
  return json(await generateDigest(), 201);
});
