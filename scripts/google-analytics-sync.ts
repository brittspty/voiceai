import { runGoogleAnalyticsSync } from "../lib/marketing/google-analytics/sync";

runGoogleAnalyticsSync()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "failed") process.exit(1);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Google Analytics sync failed";
    console.error(message);
    process.exit(1);
  });
