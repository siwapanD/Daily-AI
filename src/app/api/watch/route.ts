import { z } from "zod";
import { handle, json, readJson } from "@/lib/api";
import { listWatchItems, addWatchItem } from "@/lib/services/watch";
import { WATCH_KINDS } from "@/lib/constants";

export const GET = handle(async () => json(await listWatchItems()));
export const POST = handle(async (req: Request) => {
  const d = z.object({
    kind: z.enum(WATCH_KINDS), name: z.string().trim().min(1).max(120), pattern: z.string().trim().max(200).optional(),
    boost: z.number().int().min(1).max(30).optional(), createSource: z.boolean().optional(),
  }).parse(await readJson(req));
  return json(await addWatchItem({ ...d, pattern: d.pattern || d.name }), 201);
});
