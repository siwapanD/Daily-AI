export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AUTO_MIGRATE === "false") return;
  const { runMigrations } = await import("./lib/db/migrate");
  const { seed } = await import("./lib/db/seed");
  const { logger, errMsg } = await import("./lib/logger");
  try {
    await runMigrations();
    await seed();
  } catch (e) {
    // Do not crash the server: /api/health will report the database problem.
    logger.error("startup migration failed", { error: errMsg(e) });
  }
}
