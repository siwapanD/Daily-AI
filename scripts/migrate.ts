import { runMigrations } from "../src/lib/db/migrate";
import { closeDb } from "../src/lib/db";

runMigrations()
  .then(() => console.log("Migrations applied."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
