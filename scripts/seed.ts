import { seed } from "../src/lib/db/seed";
import { closeDb } from "../src/lib/db";

seed()
  .then(() => console.log("Seed complete."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
