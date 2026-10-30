import { prisma } from "../lib/db";
import { runJob } from "../lib/dialer";
import { creativeFatigueEnabled, digestEnabled, monitorEnabled, offlineConversionsEnabled, pageMonitorEnabled, pacingRecsEnabled, speedToLeadEnabled } from "../lib/marketing/config";
import { runCreativeFatigue } from "../lib/marketing/fatigue-job";
import { runPacingRecs } from "../lib/marketing/pacing-job";
import { runStoredOfflineCycle } from "../lib/marketing/offline/persist";
import { runPageMonitor } from "../lib/marketing/pages/store";
import { runStoredDigests, runStoredMonitor } from "../lib/marketing/persist";
import { runGoogleAdsSync } from "../lib/marketing/google-sync";
import { runSpeedToLeadSweep } from "../lib/marketing/speed-to-lead-store";
import { errorText } from "../lib/marketing/speed-to-lead";
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

function startSpeedToLead() {
  if (!speedToLeadEnabled()) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runSpeedToLeadSweep();
      if (result.status === "ran" && result.alerts) console.log(`[worker] speed-to-lead alerts ${result.alerts}`);
    } catch (error) {
      console.error("[worker] speed-to-lead failed", errorText(error));
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 10_000);
  return () => clearInterval(timer);
}

function startOfflineConversions() {
  if (!offlineConversionsEnabled()) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runStoredOfflineCycle();
      if (result.status !== "off") {
        console.log(`[worker] offline conversions ${result.status} logged=${result.logged} sent=${result.sent}`);
      }
    } catch {
      console.error("[worker] offline conversions failed");
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 15 * 60 * 1000);
  return () => clearInterval(timer);
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
      if (creativeFatigueEnabled()) {
        const fatigue = await runCreativeFatigue();
        if (fatigue.status === "ran") console.log(`[worker] creative fatigue signals ${fatigue.signals}`);
      }
      if (pacingRecsEnabled()) {
        const pacing = await runPacingRecs();
        if (pacing.status === "ran") console.log(`[worker] pacing snapshots ${pacing.snapshots}`);
      }
    } catch (error) {
      console.error("[worker] marketing sync failed", error);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), marketingSyncIntervalMs());
  const pageTimer = setInterval(() => {
    if (!pageMonitorEnabled()) return;
    void runPageMonitor().catch((error) => console.error("[worker] page monitor failed", error));
  }, 30_000);
  if (pageMonitorEnabled()) {
    void runPageMonitor().catch((error) => console.error("[worker] page monitor failed", error));
  }
  const digestTimer = digestEnabled()
    ? setInterval(() => {
        void runStoredDigests().catch((error) => console.error("[worker] marketing digest failed", error));
      }, 60 * 60 * 1000)
    : null;
  return () => {
    clearInterval(timer);
    clearInterval(pageTimer);
    if (digestTimer) clearInterval(digestTimer);
  };
}

async function main() {
  console.log("[worker] voice operations dialer started");
  const stopMarketing = startMarketingSync();
  const stopSpeed = startSpeedToLead();
  const stopConversions = startOfflineConversions();
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
  stopSpeed();
  stopConversions();
  redis.disconnect();
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
