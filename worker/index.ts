import { prisma } from "../lib/db";
import { demoWorkspaceEnabled } from "../lib/demo/flags";
import { reseedDue } from "../lib/demo/reseed";
import { applyDemoDataset } from "../lib/demo/seed-apply";
import { runJob } from "../lib/dialer";
import { adFatigueEnabled, amRealtimeEnabled, creativeFatigueEnabled, ctvAttributionEnabled, digestEnabled, googleBusinessProfileEnabled, monitorEnabled, offlineConversionsEnabled, pageMonitorEnabled, pacingRecsEnabled, skillApprovalFanoutEnabled, speedToLeadEnabled, stackAdaptEnabled } from "../lib/marketing/config";
import { runAdFatigue } from "../lib/marketing/ad-fatigue-job";
import { runAmRealtimeFeed } from "../lib/marketing/feed-job";
import { ensureSkillOfferInbox } from "../lib/marketing/skill-approval-job";
import { runCreativeFatigue } from "../lib/marketing/fatigue-job";
import { runGoogleBusinessProfile } from "../lib/marketing/gbp-sync";
import { runPacingRecs } from "../lib/marketing/pacing-job";
import { runStoredOfflineCycle } from "../lib/marketing/offline/persist";
import { runPageMonitor } from "../lib/marketing/pages/store";
import { runStoredDigests, runStoredMonitor } from "../lib/marketing/persist";
import { runStackAdaptSync } from "../lib/marketing/stackadapt-sync";
import { runCtvAttributionSync } from "../lib/marketing/ctv/sync";
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

function startDemoReseed() {
  if (!demoWorkspaceEnabled()) return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const last = await prisma.demoReseed.findUnique({ where: { id: "demo" } });
      if (!reseedDue(last?.finishedAt ?? null, new Date())) return;
      const result = await applyDemoDataset(prisma);
      console.log(`[worker] demo reseed rows ${result.rows}`);
    } catch (error) {
      console.error("[worker] demo reseed failed", error);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 60 * 60 * 1000);
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
      try {
        if (adFatigueEnabled()) {
          const fatigue = await runAdFatigue();
          if (fatigue.status === "ran") console.log(`[worker] ad fatigue checks ${fatigue.checks}`);
        }
      } catch (error) {
        console.error("[worker] ad fatigue failed", error);
      }
      try {
        if (stackAdaptEnabled()) {
          const stackadapt = await runStackAdaptSync();
          if (stackadapt.status !== "skipped") console.log(`[worker] stackadapt ${stackadapt.status}`);
        }
      } catch (error) {
        console.error("[worker] stackadapt failed", error);
      }
      try {
        if (ctvAttributionEnabled()) {
          const ctv = await runCtvAttributionSync();
          if (ctv.status !== "skipped") console.log(`[worker] ctv attribution ${ctv.status}`);
        }
      } catch (error) {
        console.error("[worker] ctv attribution failed", error);
      }
      try {
        if (googleBusinessProfileEnabled()) {
          const profile = await runGoogleBusinessProfile();
          if (profile.status !== "skipped") console.log(`[worker] business profile ${profile.status}`);
        }
      } catch (error) {
        console.error("[worker] business profile failed", error);
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
  const feedTimer = amRealtimeEnabled()
    ? setInterval(() => {
        void runAmRealtimeFeed().catch((error) => console.error("[worker] account manager feed failed", error));
      }, 30_000)
    : null;
  if (amRealtimeEnabled()) {
    void runAmRealtimeFeed().catch((error) => console.error("[worker] account manager feed failed", error));
  }
  const skillTimer = skillApprovalFanoutEnabled()
    ? setInterval(() => {
        void ensureSkillOfferInbox().catch((error) => console.error("[worker] skill offer failed", error));
      }, 60 * 60 * 1000)
    : null;
  if (skillApprovalFanoutEnabled()) {
    void ensureSkillOfferInbox().catch((error) => console.error("[worker] skill offer failed", error));
  }
  return () => {
    clearInterval(timer);
    clearInterval(pageTimer);
    if (digestTimer) clearInterval(digestTimer);
    if (feedTimer) clearInterval(feedTimer);
    if (skillTimer) clearInterval(skillTimer);
  };
}

async function main() {
  console.log("[worker] voice operations dialer started");
  const stopMarketing = startMarketingSync();
  const stopDemo = startDemoReseed();
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
  stopDemo();
  stopSpeed();
  stopConversions();
  redis.disconnect();
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
