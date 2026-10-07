import { NextResponse } from "next/server";
import { z } from "zod";
import { RateLimitError, enforceRateLimit } from "./security/rate-limit";
import { UnsafeUrlError } from "./security/url";
import { logger, errMsg } from "./logger";

export class NotFoundError extends Error {
  constructor(what = "Not found") {
    super(what);
  }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** Wrap a route handler: maps validation/rate-limit/not-found errors to proper HTTP status codes. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof z.ZodError) return json({ error: "validation_error", issues: e.issues }, 400);
      if (e instanceof RateLimitError) return json({ error: e.message }, 429);
      if (e instanceof NotFoundError) return json({ error: e.message }, 404);
      if (e instanceof UnsafeUrlError) return json({ error: e.message }, 400);
      logger.error("api error", { error: errMsg(e) });
      return json({ error: errMsg(e) }, 500);
    }
  };
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export function limitRequest(req: Request, bucket: string, max = 20) {
  enforceRateLimit(`${bucket}:${clientIp(req)}`, max, 60_000);
}

export const idParam = z.coerce.number().int().positive();

export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > 200_000) throw new z.ZodError([{ code: "custom", message: "Body too large", path: [], input: undefined }]);
  return text ? JSON.parse(text) : {};
}

export function markdownResponse(md: string, filename: string) {
  return new Response(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${filename.replace(/[^\w.-]+/g, "-")}"`,
    },
  });
}
