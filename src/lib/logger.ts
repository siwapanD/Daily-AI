type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  const min = ORDER[(process.env.LOG_LEVEL as Level) ?? "info"] ?? 20;
  if (ORDER[level] < min) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
