import { runClaritySync } from "../lib/marketing/clarity/sync";

runClaritySync()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "failed") process.exit(1);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Clarity sync failed";
    console.error(message);
    process.exit(1);
  });
