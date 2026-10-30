import { runGoogleAdsSync } from "../lib/marketing/google-sync";

runGoogleAdsSync()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "failed") process.exit(1);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
