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
const MONEY = /\$\s*\d|\b918,?273(?:\.64)?\b|\b918(?:\.3)?K\b|\bUSD\b|\bNaN\b|\b(?:spend|budgets?|bids?|max bid|cpa|cpl|cpc|cpm|cpql|roas)\b/i;
/** The staff scan must find this somewhere, or the restricted-role scans prove nothing. */
const SENTINEL_SEEN = /918,?273(?:\.6\d*)?|918(?:\.3)?K/;
const PLAN_SLUG = "example-plan";
const PLAN_TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

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
  "/audience-data/vendor-a",
  `/plan/${PLAN_SLUG}-${PLAN_TOKEN}`,
  "/c/all/youtube",
  "/c/all/linkedin",
  "/marketing/segments",
];

/** Pages each restricted role must be able to open (200). Anything else may be denied, but never 5xx or bounced to /login. */
/** Client-only or compare-only endpoints a super admin is not expected to open. */
const STAFF_EXPORT_DENIED = new Set(["/api/marketing/client", "/api/marketing/client/export", "/api/marketing/compare"]);

const MUST_LOAD: Record<string, string[]> = {
  staff: ["/", "/reports", "/marketing/ctv", "/portfolio", "/audience-data"],
  client: ["/", "/reports"],
  "client viewer": ["/marketing/client"],
};

const EXPORTS = [
  "/api/marketing/client",
  "/api/marketing/client/export",
  "/api/marketing/reports",
  "/api/marketing/reports/export",
  "/api/marketing/compare",
  "/api/marketing/ctv",
  "/api/portfolio",
  "/api/marketing/jarvis/home",
  "/api/marketing/audience-data",
  "/api/marketing/audience-data/vendor-a",
  "/api/marketing/chatgpt-ads",
];

type Hit = { role: string; url: string; where: string; sample: string };
type Bad = { role: string; url: string; status: number; finalUrl: string };
type Tally = { responses: number; sentinel: number; sentinelUrls: string[] };

/** Product copy that names a money concept without showing a value. */
const COPY_OK = [/Bots never change budgets/gi, /a person on your team (?:sets|decides)[^.]*budgets?/gi];

function stripCopy(value: string) {
  return COPY_OK.reduce((text, pattern) => text.replace(pattern, ""), value);
}

function sample(value: string) {
  const at = value.search(MONEY);
  if (at < 0) return "";
  return value.slice(Math.max(0, at - 40), at + 80).replace(/\s+/g, " ");
}

/** Yesterday, UTC, so default report ranges include the fake rows. */
const RECENT = new Date(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10));

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
    { id: "qa-staff", email: "staff.example@example.test", name: "Example Staff", role: "super_admin" as const },
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
      date: RECENT,
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
  // Fake CTV delivery with the sentinel spend.
  await prisma.ctvDeliveryDay.deleteMany({ where: { workspaceId: "org", identityKey: "qa-example" } });
  await prisma.ctvDeliveryDay.create({
    data: {
      workspaceId: "org",
      date: RECENT,
      identityKey: "qa-example",
      campaignId: "ctv_example",
      campaignName: "Example CTV",
      publisher: "Example publisher",
      deviceType: "ctv",
      impressions: BigInt(5000),
      uniqueImpressions: BigInt(4000),
      spend: SENTINEL,
      clickConversions: 2,
      viewConversions: 3,
      conversionValue: 1200,
      exampleData: true,
    },
  });
  // Fake ChatGPT Ads daily row with the sentinel spend.
  await prisma.channelDailyMetric.deleteMany({ where: { workspaceId: "org", channel: "chatgpt_ads", entityKey: "qa-example" } });
  await prisma.channelDailyMetric.create({
    data: {
      workspaceId: "org",
      date: RECENT,
      channel: "chatgpt_ads",
      entityKey: "qa-example",
      entityName: "Example ChatGPT campaign",
      impressions: BigInt(900),
      clicks: BigInt(30),
      spend: SENTINEL,
      leads: 4,
      conversions: 2,
    },
  });
  // Portfolio and Audience Data read the sentinel DailyMetric above (Audience Data rows are fixtures with example money).
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
      // No snapshot: the live client share view. A report snapshot share is made through the staff API in main().
    },
  });
  // An approved plan that asks to show cost. The public page must still hide it.
  await prisma.clientPlan.deleteMany({ where: { slug: PLAN_SLUG } });
  await prisma.clientPlan.create({
    data: {
      slug: PLAN_SLUG,
      clientName: "North Example",
      goals: "Example goals",
      channels: ["Meta"],
      dashboardSource: "baseline",
      baselineWorkspaceId: "org",
      showCost: true,
      status: "approved",
      approvedById: staff.id,
      approvedAt: new Date(),
      tokenHash: createHash("sha256").update(PLAN_TOKEN).digest("hex"),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdById: staff.id,
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
      // QA run only. Production defaults stay off.
      INTEGRATIONS_MODE: "mock",
      CHATGPT_ADS_MODE: "mock",
      MARKETING_SYNC_MODE: "mock",
      UX_LAUNCH_GAPS: "on",
      JARVIS_UI_V2: "on",
      CHANNEL_REGISTRY: "on",
      CTV_ATTRIBUTION: "on",
      CHATGPT_ADS: "on",
      AUDIENCE_DATA: "on",
      AUDIENCE_DATA_CLIENT: "on",
      AUDIENCE_DATA_P1: "on",
      AUDIENCE_LIBRARY: "on",
      RESOLUTION_DATA: "on",
      INSIGHTS: "on",
      JARVIS_REPORTS_V2: "on",
      REPORTS_P1: "on",
      CLIENT_PLANS: "on",
      SEGMENT_ENGINE: "on",
      MARKETING_DASHBOARDS_V2: "on",
      MARKETING_CLIENT_LINKS: "on",
      MARKETING_CLIENT_VIEWERS: "on",
      ALL_CLIENTS_VIEWER_SEES_COST: "off",
      LOGIN_ANALYTICS: "on",
      MARKETING_SUPER_ADMIN_EMAILS: "nobody.example@example.test",
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

function isLoginBounce(finalUrl: string) {
  try {
    return new URL(finalUrl).pathname === "/login";
  } catch {
    return false;
  }
}

async function chartText(page: Page) {
  const options = await page.evaluate(() => (window as unknown as { __qaChartOptions?: unknown[] }).__qaChartOptions ?? []).catch(() => []);
  const svg = await page.locator("svg text, svg tspan").allTextContents().catch(() => [] as string[]);
  return { count: options.length, text: `${JSON.stringify(options)}\n${svg.join("\n")}` };
}

async function scanPage(page: Page, role: string, url: string, hits: Hit[], bad: Bad[], tally: Tally, mustLoad: boolean) {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 90000 }).catch(() => null);
  const status = response?.status() ?? 0;
  const finalUrl = page.url();
  tally.responses += 1;
  if (isLoginBounce(finalUrl) && !new URL(url).pathname.startsWith("/login")) bad.push({ role, url, status, finalUrl });
  else if (status >= 500 || status === 0) bad.push({ role, url, status, finalUrl });
  else if (mustLoad && status !== 200) bad.push({ role, url, status, finalUrl });
  await page.locator("body").waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
  const body = await page.locator("body").innerText().catch(() => "");
  const tips = await page.locator("[title], [aria-label]").evaluateAll((nodes) =>
    nodes.flatMap((node) => [node.getAttribute("title") || "", node.getAttribute("aria-label") || ""]).filter(Boolean),
  );
  const charts = await chartText(page);
  const all = [body, tips.join("\n"), charts.text].join("\n");
  if (SENTINEL_SEEN.test(all)) {
    tally.sentinel += 1;
    tally.sentinelUrls.push(new URL(url).pathname);
  }
  if (role === "staff") return;
  const found = [body, tips.join("\n"), charts.text].map(stripCopy).filter((part) => MONEY.test(part));
  if (found.length) hits.push({ role, url: `${url} [${status}]`, where: charts.count && MONEY.test(charts.text) ? "page/chart" : "page", sample: sample(found.join(" ")) });
}

async function scanExport(context: BrowserContext, role: string, url: string, hits: Hit[], bad: Bad[], tally: Tally, mustLoad: boolean) {
  const response = await context.request.get(url, { maxRedirects: 0 });
  const text = await response.text();
  const status = response.status();
  tally.responses += 1;
  const location = response.headers()["location"] || "";
  if (status >= 300 && status < 400 && location.includes("/login")) bad.push({ role, url, status, finalUrl: location });
  else if (status >= 500) bad.push({ role, url, status, finalUrl: url });
  else if (mustLoad && status !== 200) bad.push({ role, url, status, finalUrl: url });
  if (SENTINEL_SEEN.test(text)) {
    tally.sentinel += 1;
    tally.sentinelUrls.push(new URL(url).pathname);
  }
  if (role === "staff") return;
  if (MONEY.test(text)) hits.push({ role, url: `${url} [${status}]`, where: "export", sample: sample(text) });
}

async function main() {
  const prisma = new PrismaClient();
  const token = await seed(prisma);
  await prisma.$disconnect();
  const server = startServer();
  const hits: Hit[] = [];
  const bad: Bad[] = [];
  const tallies: Record<string, Tally> = {};
  const browser = await chromium.launch({ headless: true });
  let reportShare = "";
  try {
    await waitForServer(server);
    for (const [role, email] of [
      ["staff", "staff.example@example.test"],
      ["client", "owner.example@example.test"],
      ["client viewer", "viewer.example@example.test"],
    ] as const) {
      const tally: Tally = (tallies[role] = { responses: 0, sentinel: 0, sentinelUrls: [] });
      const context = await browser.newContext();
      await context.addInitScript(() => {
        (window as unknown as { __qaChartOptions?: unknown[] }).__qaChartOptions = [];
      });
      await signIn(context, email);
      const page = await context.newPage();
      const must = new Set(MUST_LOAD[role] ?? []);
      for (const path of PAGES) await scanPage(page, role, `${ORIGIN}${path}`, hits, bad, tally, must.has(path));
      for (const path of EXPORTS) await scanExport(context, role, `${ORIGIN}${path}`, hits, bad, tally, role === "staff" && !STAFF_EXPORT_DENIED.has(path));
      if (role === "staff") {
        const made = await context.request.post(`${ORIGIN}/api/marketing/reports/share`, { data: { days: 7, query: "" } });
        const body = (await made.json().catch(() => ({}))) as { url?: string; error?: string };
        reportShare = body.url ? body.url.split("/share/")[1] || "" : "";
        if (!reportShare) bad.push({ role, url: "/api/marketing/reports/share (create)", status: made.status(), finalUrl: body.error || "" });
      }
      await context.close();
    }
    const tally: Tally = (tallies["share link"] = { responses: 0, sentinel: 0, sentinelUrls: [] });
    const share = await browser.newContext();
    await share.addInitScript(() => {
      (window as unknown as { __qaChartOptions?: unknown[] }).__qaChartOptions = [];
    });
    const page = await share.newPage();
    await scanPage(page, "share link", `${ORIGIN}/share/${token}`, hits, bad, tally, true);
    await scanPage(page, "share link", `${ORIGIN}/plan/${PLAN_SLUG}-${PLAN_TOKEN}`, hits, bad, tally, true);
    if (reportShare) await scanPage(page, "share link", `${ORIGIN}/share/${reportShare}`, hits, bad, tally, true);
    for (const shared of [token, reportShare].filter(Boolean)) {
      for (const path of [`/api/share/${shared}`, `/api/share/${shared}/export`, `/api/share/${shared}/insights`]) {
        await scanExport(share, "share link", `${ORIGIN}${path}`, hits, bad, tally, path === `/api/share/${shared}`);
      }
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
  for (const [role, tally] of Object.entries(tallies)) {
    const sentinel = role === "staff" ? `, sentinel found on ${tally.sentinel} (${[...new Set(tally.sentinelUrls)].join(" ")})` : "";
    console.log(`${role}: ${tally.responses} responses${sentinel}, money hits ${hits.filter((hit) => hit.role === role).length}, bad status ${bad.filter((row) => row.role === role).length}`);
  }
  let failed = false;
  if (!tallies.staff || tallies.staff.sentinel === 0) {
    console.log("FAIL: the staff scan never saw the 918273.64 sentinel, so the restricted scans prove nothing.");
    failed = true;
  }
  if (bad.length) {
    failed = true;
    console.log(`FAIL: ${bad.length} responses did not load as expected:`);
    for (const row of bad) console.log(`- ${row.role} ${row.url} -> ${row.status} ${row.finalUrl}`);
  }
  if (hits.length) {
    failed = true;
    console.log(`FAIL: ${hits.length} money hits:`);
    for (const hit of hits) console.log(`- ${hit.role} ${hit.where} ${hit.url}: ${hit.sample}`);
  }
  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log("PASS: staff sees the sentinel; client, client viewer, and share link show no spend, bid, CPA, CPL, CPM, ROAS, or budget.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
