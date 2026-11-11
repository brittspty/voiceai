/**
 * Upsert GoHighLevel contacts for HomepageContact rows that have no ghlContactId.
 * Does not send the demo alert email.
 *
 * Dry run is the default. It prints the candidate count and does not call GoHighLevel.
 *   tsx scripts/homepage-contact-backfill.ts
 *   tsx scripts/homepage-contact-backfill.ts --limit 50
 * Apply writes to the location in GHL_LOCATION_ID using GHL_API_TOKEN:
 *   tsx scripts/homepage-contact-backfill.ts --apply
 *
 * Do not run --apply against production.
 */
import { prisma } from "../lib/db";
import { backfillHomepageContacts } from "../lib/homepage-contact-sync";

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}

function arg(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

function secrets() {
  return [process.env.GHL_API_TOKEN || "", process.env.RESEND_API_KEY || ""].filter((value) => value.length >= 8);
}

function redact(text: string) {
  let out = text;
  for (const secret of secrets()) out = out.split(secret).join("[redacted]");
  return out;
}

async function main() {
  const rawLimit = arg("limit");
  const limit = rawLimit ? Number(rawLimit) : undefined;
  if (rawLimit && (!Number.isInteger(limit) || (limit ?? 0) < 1 || (limit ?? 0) > 500)) {
    throw new Error("--limit must be a whole number from 1 to 500");
  }
  const result = await backfillHomepageContacts({ apply: flag("apply"), limit });
  const line = JSON.stringify(result);
  if (secrets().some((secret) => line.includes(secret))) throw new Error("Refusing to print a result that contained a secret.");
  console.log(line);
  if (!result.apply) console.log("Dry run. Pass --apply to upsert contacts. Do not run --apply against production.");
}

main()
  .catch((error) => {
    console.error(redact(error instanceof Error ? error.message : "Homepage contact backfill failed"));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
