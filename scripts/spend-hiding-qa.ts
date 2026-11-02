/**
 * Browser check that client, client viewer, and share-link sessions never see money.
 * Uses fake rows only. The sentinel spend is 918273.64.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { chromium, type BrowserContext, type Page } from "playwright";

const ORIGIN = process.env.QA_ORIGIN || "http://127.0.0.1:43124";
const PASSWORD = "Example-pass-12";
const SENTINEL = "918273.64";
const MONEY = /\$\s*\d|\b918273(?:\.64)?\b|\bUSD\b|\bNaN\b|\b(?:spend|budgets?|bids?|cpa|cpl|cpc|roas)\b/i;

const PAGES = [
  "/",
  "/marketing",
  "/marketing/client",
  "/marketing/ctv",
  "/marketing/chatgpt-ads",
  "/marketing/compare",
  "/audience-data",
  "/audience-data/resolution",
  "/audience-data/lineage",
  "/audience-data/drill",
  "/insights",
  "/decisions",
  "/plans",
  "/notifications",
  "/calls",
  "/ais2l",
  "/reports",
  "/reports/schedules",
  "/reports/print",
  "/portfolio",
  "/settings",
  "/settings/connections",
  "/sites/landing-pages",
];

const EXPORTS = [
  "/api/marketing/client",
  "/api/marketing/client/export",
  "/api/marketing/reports",
  "/api/marketing/reports/export",
  "/api/marketing/compare",
  "/api/marketing/ctv",
  "/api/portfolio",
  "/api/marketing/jarvis/home",
];

type Hit = { role: string; url: string; where: string; sample: string };

function sample(value: string) {
  const at = value.search(MONEY);
  if (at < 0) return "";
  return value.slice(Math.max(0, at - 40), at + 80).replace(/\s+/g, " ");
}

async function seed(prisma: PrismaClient) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await prisma.org.upsert({
    where: { id: "org" },
    update: { name: "North Example" },
    create: { id: "org", name: "North Example", subtitle: "Example", agentName: "Example", timezone: "America/New_York" },
  });
  await prisma.workspace.upsert({
    where: { id: "org" },
    update: { name: "North Example" },
    create: { id: "org", name: "North Example" },
  });
  const people = [
    { id: "qa-staff", email: "staff.example@example.test", name: "Example Staff", role: "admin" as const },
    { id: "qa-owner", email: "owner.example@example.test", name: "Example Client", role: "owner" as const },
    { id: "qa-viewer", email: "viewer.example@example.test", name: "Example Viewer", role: "client_viewer" as const },
  ];
  for (const person of people) {
    await prisma.user.upsert({
      where: { email: person.email },
      update: { passwordHash, role: person.role, disabledAt: null, totpEnabled: false },
      create: { id: person.id, email: person.email, name: person.name, passwordHash, role: person.role },
    });
  }
  const viewer = await prisma.user.findUniqueOrThrow({ where: { email: "viewer.example@example.test" } });
  await prisma.clientViewerAccess.upsert({
    where: { userId: viewer.id },
    update: { workspaceId: "org" },
    create: { userId: viewer.id, workspaceId: "org" },
  });
  await prisma.marketingAssignment.deleteMany({ where: { userId: viewer.id } });
  await prisma.marketingAssignment.create({ data: { userId: viewer.id, workspaceId: "org", scopeKind: "client" } });

  const connection = await prisma.platformConnection.upsert({
    where: { workspaceId_platform: { workspaceId: "org", platform: "meta" } },
    update: {},
    create: { workspaceId: "org", platform: "meta", authType: "internal", secretRef: "example-ref", status: "connected" },
  });
  const account = await prisma.adAccount.upsert({
    where: { workspaceId_platform_externalId: { workspaceId: "org", platform: "meta", externalId: "act_example" } },
    update: { name: "Example account" },
    create: {
      workspaceId: "org",
      connectionId: connection.id,
      platform: "meta",
      externalId: "act_example",
      name: "Example account",
      currency: "USD",
      timezone: "America/New_York",
    },
  });
  const campaign = await prisma.campaign.upsert({
    where: { workspaceId_platform_externalId: { workspaceId: "org", platform: "meta", externalId: "camp_example" } },
    update: { name: "Example campaign" },
    create: {
      workspaceId: "org",
      adAccountId: account.id,
      platform: "meta",
      externalId: "camp_example",
      name: "Example campaign",
    },
  });
  const group = await prisma.adGroup.upsert({
    where: { workspaceId_platform_externalId: { workspaceId: "org", platform: "meta", externalId: "ag_example" } },
    update: { name: "Example group" },
    create: { workspaceId: "org", campaignId: campaign.id, platform: "meta", externalId: "ag_example", name: "Example group" },
  });
  const ad = await prisma.ad.upsert({
    where: { workspaceId_platform_externalId: { workspaceId: "org", platform: "meta", externalId: "ad_example" } },
    update: { name: "Example ad" },
    create: { workspaceId: "org", adGroupId: group.id, platform: "meta", externalId: "ad_example", name: "Example ad" },
  });
  const segment = await prisma.audienceSegment.upsert({
    where: { workspaceId_kind_segmentKey: { workspaceId: "org", kind: "targeting", segmentKey: "example" } },
    update: { label: "Example audience" },
    create: { workspaceId: "org", kind: "targeting", segmentKey: "example", label: "Example audience" },
  });
  await prisma.dailyMetric.deleteMany({ where: { adId: ad.id } });
  await prisma.dailyMetric.create({
    data: {
      workspaceId: "org",
      date: new Date("2026-10-15"),
      platform: "meta",
      campaignId: campaign.id,
      adGroupId: group.id,
      adId: ad.id,
      audienceSegmentId: segment.id,
      attributionWindow: "7d_click",
      spend: SENTINEL,
      platformLeads: 12,
      platformConversions: 3,
      impressions: 1000,
      clicks: 40,
    },
  });
  const token = randomBytes(24).toString("base64url");
  const staff = await prisma.user.findUniqueOrThrow({ where: { email: "staff.example@example.test" } });
  await prisma.clientShareLink.deleteMany({ where: { label: "Example share" } });
  await prisma.clientShareLink.create({
    data: {
      workspaceId: "org",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      label: "Example share",
      createdById: staff.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      snapshot: { spend: SENTINEL, budget: 500, cpa: 40, cpl: 12, roas: 3, bid: 1.5, note: `Spend $${SENTINEL}` },
    },
  });
  return token;
}

function startServer() {
  const child = spawn("npx", ["next", "dev", "-p", "43124"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: "43124",
      MARKETING_CLIENT_LINKS: "on",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  return child;
}

async function waitForServer(child: ChildProcess) {
  let log = "";
  child.stdout?.on("data", (chunk) => {
    log += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    log += chunk.toString();
  });
  const started = Date.now();
  while (Date.now() - started < 90000) {
    if (child.exitCode != null) throw new Error(`Next exited early\n${log.slice(-2000)}`);
    try {
      const response = await fetch(`${ORIGIN}/api/health`);
      if (response.ok || response.status === 401) return;
    } catch {
      /* still booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next did not start\n${log.slice(-2000)}`);
}

async function signIn(context: BrowserContext, email: string) {
  const response = await context.request.post(`${ORIGIN}/api/auth/login`, {
    data: { email, password: PASSWORD },
  });
  if (!response.ok()) throw new Error(`Sign-in failed for ${email}: ${response.status()} ${await response.text()}`);
}

async function scanPage(page: Page, role: string, url: string, hits: Hit[]) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const status = response?.status() ?? 0;
  const body = await page.locator("body").innerText().catch(() => "");
  const tips = await page.locator("[title], [aria-label]").evaluateAll((nodes) =>
    nodes.flatMap((node) => [node.getAttribute("title") || "", node.getAttribute("aria-label") || ""]).filter(Boolean),
  );
  const found = [body, tips.join("\n")].filter((part) => MONEY.test(part));
  if (found.length) hits.push({ role, url: `${url} [${status}]`, where: "page", sample: sample(found.join(" ")) });
}

async function scanExport(context: BrowserContext, role: string, url: string, hits: Hit[]) {
  const response = await context.request.get(url);
  const text = await response.text();
  if (MONEY.test(text)) hits.push({ role, url: `${url} [${response.status()}]`, where: "export", sample: sample(text) });
}

async function main() {
  const prisma = new PrismaClient();
  const token = await seed(prisma);
  await prisma.$disconnect();
  const server = startServer();
  const hits: Hit[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForServer(server);
    for (const [role, email] of [
      ["client", "owner.example@example.test"],
      ["client viewer", "viewer.example@example.test"],
    ] as const) {
      const context = await browser.newContext();
      await signIn(context, email);
      const page = await context.newPage();
      for (const path of PAGES) await scanPage(page, role, `${ORIGIN}${path}`, hits);
      for (const path of EXPORTS) await scanExport(context, role, `${ORIGIN}${path}`, hits);
      await context.close();
    }
    const share = await browser.newContext();
    const page = await share.newPage();
    await scanPage(page, "share link", `${ORIGIN}/share/${token}`, hits);
    for (const path of [`/api/share/${token}`, `/api/share/${token}/export`, `/api/share/${token}/insights`]) {
      await scanExport(share, "share link", `${ORIGIN}${path}`, hits);
    }
    await share.close();
  } finally {
    await browser.close();
    if (server.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        server.kill("SIGTERM");
      }
    }
  }
  const checked = PAGES.length * 2 + EXPORTS.length * 2 + 1 + 3;
  console.log(`Checked ${checked} page and export responses.`);
  if (!hits.length) {
    console.log("No spend, bid, CPA, CPL, ROAS, or budget values for client, client viewer, or share link.");
    return;
  }
  console.log(`Found ${hits.length} money hits:`);
  for (const hit of hits) console.log(`- ${hit.role} ${hit.where} ${hit.url}: ${hit.sample}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
