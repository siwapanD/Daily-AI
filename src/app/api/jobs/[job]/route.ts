import { z } from "zod";
import { handle, json, limitRequest } from "@/lib/api";
import { fetchJob, analyzeJob, embedJob, digestJob, notifyJob, exportJob, dailyJob } from "@/lib/services/jobs";

const JOBS = { fetch: fetchJob, analyze: analyzeJob, embed: embedJob, digest: digestJob, notify: () => notifyJob(), export: exportJob, daily: dailyJob };
export const maxDuration = 600;

/** POST /api/jobs/{fetch|analyze|embed|digest|notify|export|daily}. Cron uses Authorization: Bearer $CRON_SECRET. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ job: string }> }) => {
  limitRequest(req, "job", 10);
  const job = z.enum(["fetch", "analyze", "embed", "digest", "notify", "export", "daily"]).parse((await params).job);
  return json({ job, result: await JOBS[job]() });
});
