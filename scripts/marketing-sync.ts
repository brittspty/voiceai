import { runGoogleAdsSync } from "../lib/marketing/google-sync";
import { runMarketingSync } from "../lib/marketing/sync";

async function main() {
  const meta = await runMarketingSync();
  const googleAds = await runGoogleAdsSync();
  console.log(JSON.stringify({ meta, googleAds }, null, 2));
  if (meta.status === "failed" || googleAds.status === "failed") process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});