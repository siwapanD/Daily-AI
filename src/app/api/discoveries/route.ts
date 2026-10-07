import { z } from "zod";
import { handle, json, readJson, limitRequest } from "@/lib/api";
import { listDiscoveries } from "@/lib/services/discoveries";
import { addManualUrl } from "@/lib/services/discovery";
import { analyzeOne } from "@/lib/services/analysis";

const filter = z.object({
  q: z.string().max(200).optional(),
  category: z.string().max(40).optional(),
  recommendation: z.string().max(40).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  sourceId: z.coerce.number().int().positive().optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = handle(async (req: Request) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return json(await listDiscoveries(filter.parse(params)));
});

/** Manual URL: { "url": "https://..." } → fetched, stored, analyzed. */
export const POST = handle(async (req: Request) => {
  limitRequest(req, "manual", 10);
  const { url } = z.object({ url: z.string().url().max(2048) }).parse(await readJson(req));
  const r = await addManualUrl(url);
  await analyzeOne(r.id);
  return json(r, r.created ? 201 : 200);
});
