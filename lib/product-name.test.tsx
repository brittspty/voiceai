import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import NotFound from "../app/not-found";
import ForgotPasswordPage from "../app/forgot-password/page";
import { DemoScreens } from "../components/demo-screens";
import { LoginAnalyticsScreen } from "../components/login-analytics-screen";
import { LoginScreen } from "../components/login-form";
import { PlanClosed } from "../components/plan-closed";
import { PlanDocument } from "../components/plan-document";
import { PublicHomepage } from "../components/public-homepage";
import { ReportScreen } from "../components/reports/report-screen";
import { ShareChrome } from "../components/share-chrome";
import { PRODUCT_NAME, PRODUCT_WORDMARK } from "./brand/names";
import { buildDemoDataset, DEMO_FACTS } from "./demo/dataset";
import { presentDemo } from "./demo/present";
import { renderTourSteps } from "./demo/tour";
import { homepageMetadata, homepageModel, homepageProse } from "./homepage-content";
import { quizRead } from "./homepage-quiz";
import { inviteEmailCopy } from "./mail";
import { requestMagicLink, type MagicLinkRecord, type MagicLinkStore } from "./magic-link";
import { digestEmail } from "./marketing/digest-send";
import { jarvisNav } from "./marketing/channels/nav";
import { clientShareCsv, reportPdfLines, sealClientReport, type ClientShareView } from "./marketing/client-view";
import { requestPasswordReset, type PasswordResetRecord, type PasswordResetStore } from "./password-reset";
import { buildReportPdf } from "./marketing/reports/pdf";
import { reportFooterLine } from "./marketing/reports/brand";
import { exampleReportSource } from "./marketing/reports/example-source";
import { dashboardFromMetrics } from "./plans/plan";

const router = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

function renderPublic(node: ReactElement) {
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider,
      { value: router as never },
      createElement(
        PathnameContext.Provider,
        { value: "/" },
        createElement(SearchParamsContext.Provider, { value: new URLSearchParams() as never }, node),
      ),
    ),
  );
}

function wholeWordJarvis(text: string) {
  return text.match(/\bJarvis\b/g) ?? [];
}

/** Visible copy. Style blocks and tags stay out so CSS class names are not product copy. */
function visibleCopy(text: string) {
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, (block) => block.replace(/https?:\/\/[^"'\\\s]+/g, " ").replace(/\/brand\/[^"'\\\s]+/g, " "))
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
}

const loginBrand = {
  companyName: "Specificity",
  brandColor: "#FF5800",
  logoUrl: "/brand/specificity-mark.png",
  mark: "S",
  wordmark: "Specificity",
  tagline: "Identify. Engage. Convert.",
  productLine: "Avery calls your new leads in minutes.",
};

test("rendered public pages and email templates do not say Jarvis", async () => {
  const home = homepageModel({ PUBLIC_HOMEPAGE: "on" });
  const pages = [
    renderPublic(createElement(PublicHomepage, { model: home })),
    renderPublic(createElement(LoginScreen, { brand: loginBrand, hint: null, magicLink: true, magicLinkDelivery: false })),
    renderPublic(createElement(LoginAnalyticsScreen, { brand: loginBrand, hint: null, audience: "client", magicLink: true, magicLinkDelivery: true, initial: null })),
    renderPublic(createElement(ForgotPasswordPage)),
    renderPublic(createElement(NotFound)),
    renderPublic(createElement(PlanClosed, { state: "expired" })),
    renderPublic(createElement(PlanClosed, { state: "revoked" })),
    renderPublic(
      createElement(PlanDocument, {
        plan: {
          clientName: "Gulf Coast Dental",
          logoSrc: null,
          goals: "More booked visits",
          channels: ["Meta"],
          audiences: ["Verified humans"],
          segments: ["New patients"],
          timeline: "Week 1",
          weekly: "A short note",
          ctaLabel: "Let's start",
          ctaHref: "/contact",
          dashboard: dashboardFromMetrics([{ impressions: 10, clicks: 2, leads: 1 }], false),
          showCost: false,
        },
      }),
    ),
    renderPublic(
      createElement(ShareChrome, null, createElement("p", null, "This link isn't valid. Ask your account manager for a new one.")),
    ),
    renderPublic(createElement(ShareChrome, null, createElement("p", null, "This link was turned off."))),
    renderPublic(createElement(DemoScreens, { screen: "explanations", data: presentDemo(buildDemoDataset(), "staff"), tourEnabled: true })),
  ];

  const staff = await exampleReportSource.load({ range: "30d", compare: "prior", clientId: "harbor" });
  const shared = sealClientReport(staff);
  pages.push(renderPublic(createElement(ReportScreen, { initial: shared, mode: "share", canShare: false, canStaffPdf: false, pdfDefault: "client", pollUrl: null })));

  const shareView: ClientShareView = {
    client: "Gulf Coast Dental",
    viewOnly: true,
    rangeLabel: "Last 7 days",
    kpis: [{ label: "Leads", value: "4", delta: "steady", meaning: "People who asked" }],
    campaigns: [{ name: "Implants", status: "Steady", booked: 1, leads: 4, channel: "Meta", detail: "Holding" }],
    updated: "Updated just now",
    sharedBy: "your account manager",
    expires: "expires 2026-12-01",
  };

  const magicMail: { subject: string; body: string }[] = [];
  const magicRows = new Map<string, MagicLinkRecord>();
  const magicStore: MagicLinkStore = {
    async create(row) {
      magicRows.set(row.tokenHash, { ...row });
    },
    async find(tokenHash) {
      const row = magicRows.get(tokenHash);
      return row ? { ...row } : null;
    },
    async markUsed() {
      return false;
    },
  };
  await requestMagicLink({
    email: "ada@example.com",
    env: { MAGIC_LINK_ENABLED: "on" },
    origin: "https://diverai.specificityinc.com",
    findUser: async () => ({ email: "ada@example.com" }),
    store: magicStore,
    recordMail: async (row) => {
      magicMail.push(row);
    },
  });

  const resetMail: { subject: string; body: string }[] = [];
  const resetRows = new Map<string, PasswordResetRecord>();
  const resetStore: PasswordResetStore = {
    async create(row) {
      resetRows.set(row.tokenHash, { ...row });
    },
    async find(tokenHash) {
      const row = resetRows.get(tokenHash);
      return row ? { ...row } : null;
    },
    async markUsed() {
      return false;
    },
  };
  await requestPasswordReset({
    email: "ada@example.com",
    env: { PASSWORD_RESET: "on" },
    origin: "https://diverai.specificityinc.com",
    limits: new Map(),
    findUser: async () => ({ email: "ada@example.com" }),
    store: resetStore,
    recordMail: async (row) => {
      resetMail.push(row);
    },
  });

  const invite = inviteEmailCopy({ name: "Ada", link: "https://diverai.specificityinc.com/invite/token" });
  const digest = digestEmail({
    name: "Ada",
    payload: {
      alerts: [{ id: "a", title: "Landing page down", summary: "Three checks failed.", accountId: "act_1" }],
      recommendations: [{ id: "r", title: "Rotate the tired ad", summary: "Clicks are falling.", accountId: "act_1" }],
      notes: ["12 leads waiting for a quality mark"],
    },
  });
  const metadata = homepageMetadata();
  const manifest = readFileSync(new URL("../public/site.webmanifest", import.meta.url), "utf8");
  const notification = readFileSync(new URL("../public/push-sw.js", import.meta.url), "utf8");
  const pdf = buildReportPdf(shared).toString("latin1");
  const scanned = [
    ...pages,
    homepageProse(home),
    jarvisNav({ audience: "staff", showAis2l: true, decisionCount: 1, showLive: true }).map((item) => item.label).join("\n"),
    jarvisNav({ audience: "client", showAis2l: true, decisionCount: 0, showLive: false }).map((item) => item.label).join("\n"),
    `${PRODUCT_WORDMARK} home`,
    JSON.stringify(metadata),
    manifest,
    notification,
    (quizRead({ q1: "u", q2: "y", q3: "y", q4: "y" }) || []).join("\n"),
    renderTourSteps(DEMO_FACTS).map((step) => `${step.title} ${step.body}`).join("\n"),
    magicMail.map((row) => `${row.subject}\n${row.body}`).join("\n"),
    resetMail.map((row) => `${row.subject}\n${row.body}`).join("\n"),
    `${invite.subject}\n${invite.text}`,
    `${digest.subject}\n${digest.text}`,
    reportFooterLine(),
    reportPdfLines(shared).join("\n"),
    reportPdfLines(staff).join("\n"),
    pdf,
    clientShareCsv(shareView),
    PRODUCT_NAME,
    PRODUCT_WORDMARK,
  ].join("\n");

  const capital = wholeWordJarvis(scanned);
  const visible = visibleCopy(scanned);
  const lower = visible.match(/\bjarvis\b/gi) ?? [];
  const diver = visible.match(/\bdiver ai\b/gi) ?? [];
  assert.deepEqual(capital, [], capital.join(","));
  assert.deepEqual(lower, [], `${lower.join(",")} near ${JSON.stringify(visible.slice(Math.max(0, visible.toLowerCase().indexOf("jarvis") - 60), visible.toLowerCase().indexOf("jarvis") + 60))}`);
  assert.deepEqual(diver, [], `${diver.join(",")} near ${JSON.stringify(visible.slice(Math.max(0, visible.toLowerCase().indexOf("diver ai") - 60), visible.toLowerCase().indexOf("diver ai") + 60))}`);
  assert.equal(scanned.includes("Diver AI"), false);
  assert.match(visible, /\bJAI\b/);
  assert.match(scanned, /JAI by Specificity/);
  assert.match(scanned, /JAI home/);
  assert.match(manifest, /"short_name": "JAI"/);
});
