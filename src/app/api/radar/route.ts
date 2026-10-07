import { z } from "zod";
import { handle, json, readJson } from "@/lib/api";
import { listRadar, upsertRadarItem } from "@/lib/services/radar";
import { RADAR_QUADRANTS, RADAR_RINGS } from "@/lib/constants";

export const GET = handle(async () => json(await listRadar()));
export const POST = handle(async (req: Request) => {
  const d = z.object({
    name: z.string().trim().min(1).max(120), ring: z.enum(RADAR_RINGS), quadrant: z.enum(RADAR_QUADRANTS).default("Tools"),
    rationale: z.string().max(1000).optional(),
  }).parse(await readJson(req));
  return json(await upsertRadarItem(d), 201);
});
