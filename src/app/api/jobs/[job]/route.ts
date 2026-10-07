import { z } from "zod";
import { handle, json, limitRequest } from "@/lib/api";
import { fetchJob, analyzeJob, digestJob, dailyJob } from "@/lib/services/jobs";

const JOBS = { fetch: fetchJob, analyze: analyzeJob, digest: digestJob, daily: dailyJob };
export const maxDuration = 600;

/** POST /api/jobs/{fetch|analyze|digest|daily}. Cron uses Authorization: Bearer $CRON_SECRET. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ job: string }> }) => {
  limitRequest(req, "job", 10);
  const job = z.enum(["fetch", "analyze", "digest", "daily"]).parse((await params).job);
  return json({ job, result: await JOBS[job]() });
});
