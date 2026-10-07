// Run the daily pipeline directly (no HTTP server needed): npm run job:daily
import { dailyJob } from "../src/lib/services/jobs";
import { closeDb } from "../src/lib/db";

dailyJob()
  .then((stats) => console.log(JSON.stringify(stats, null, 2)))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
