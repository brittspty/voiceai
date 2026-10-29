import { prisma } from "../lib/db";
import { runJob } from "../lib/dialer";
import { digestEnabled, monitorEnabled } from "../lib/marketing/config";
import { runStoredDigests, runStoredMonitor } from "../lib/marketing/persist";
import { runGoogleAdsSync } from "../lib/marketing/google-sync";
import { marketingSyncIntervalMs, runMarketingSync } from "../lib/marketing/sync";
import { claimJob, failOrRetry } from "../lib/queue";
import { createRedis } from "../lib/redis";

const QUEUE_KEY = "voiceops:jobs";

async function tick() {
  const job = await claimJob();
  if (!job) return false;
  try {
    await runJob(job);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "succeeded", finishedAt: new Date(), lockedAt: null },
    });
  } catch (error) {
    console.error(`[worker] job ${job.id} failed`, error);
    await failOrRetry(job.id, job.attempts, job.maxAttempts, error);
  }
  return true;
}

function startMarketingSync() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runMarketingSync();
      if (result.status !== "skipped") {
        console.log(`[worker] marketing sync ${result.status}${result.error ? `: ${result.error}` : ""}`);
      }
      if (monitorEnabled() && result.status === "succeeded") {
        const monitored = await runStoredMonitor();
        if (monitored.status === "ran") console.log(`[worker] marketing monitor alerts ${monitored.alerts}`);
      }
      try {
        const google = await runGoogleAdsSync();
        if (google.status !== "skipped") {
          console.log(`[worker] google ads sync ${google.status}${google.error ? `: ${google.error}` : ""}`);
        }
      } catch (error) {
        console.error("[worker] google ads sync failed", error);
      }
    } catch (error) {
      console.error("[worker] marketing sync failed", error);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), marketingSyncIntervalMs());
  const digestTimer = digestEnabled()
    ? setInterval(() => {
        void runStoredDigests().catch((error) => console.error("[worker] marketing digest failed", error));
      }, 60 * 60 * 1000)
    : null;
  return () => {
    clearInterval(timer);
    if (digestTimer) clearInterval(digestTimer);
  };
}

async function main() {
  console.log("[worker] voice operations dialer started");
  const stopMarketing = startMarketingSync();
  const redis = createRedis();
  let connected = false;
  try {
    await redis.connect();
    connected = true;
  } catch {
    console.log("[worker] redis unavailable, polling postgres");
  }
  let stopped = false;
  process.on("SIGTERM", () => {
    stopped = true;
  });
  process.on("SIGINT", () => {
    stopped = true;
  });
  while (!stopped) {
    const worked = await tick();
    if (worked) continue;
    if (connected) {
      try {
        await redis.brpop(QUEUE_KEY, 2);
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  stopMarketing();
  redis.disconnect();
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
