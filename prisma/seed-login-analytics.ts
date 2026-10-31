import { PrismaClient, type AdPlatform, type Prisma } from "@prisma/client";
import { clientConfig } from "../lib/client-config";
import { addDaysISO, zonedISODate } from "../lib/time";

const ZONE = "America/New_York";

const CLIENTS: {
  id: string;
  name: string;
  channels: AdPlatform[];
  leads: number;
  quality: number;
  provisional: boolean;
  alerts: number;
  match: number;
  pixelHours: number;
  scale: number;
  learning: number;
  cut: number;
  answered: number;
  booked: number;
  noAnswer: number;
}[] = [
  { id: "org", name: "Specificity Inc", channels: ["meta", "google_ads"], leads: 8200, quality: 74, provisional: false, alerts: 0, match: 0.58, pixelHours: 1, scale: 3, learning: 2, cut: 0, answered: 40, booked: 11, noAnswer: 6 },
  { id: "gulf", name: "Gulf Coast Senior Insurance", channels: ["meta", "google_ads"], leads: 6120, quality: 68, provisional: false, alerts: 2, match: 0.41, pixelHours: 8, scale: 2, learning: 5, cut: 1, answered: 28, booked: 7, noAnswer: 9 },
  { id: "harbor", name: "Harbor & Pine Dental", channels: ["meta", "google_ads"], leads: 9402, quality: 79, provisional: true, alerts: 0, match: 0.62, pixelHours: 1, scale: 3, learning: 2, cut: 0, answered: 33, booked: 8, noAnswer: 4 },
  { id: "mesa", name: "Mesa Roofing Co", channels: ["meta", "google_ads", "linkedin"], leads: 3880, quality: 74, provisional: false, alerts: 1, match: 0.16, pixelHours: 2, scale: 1, learning: 3, cut: 0, answered: 18, booked: 4, noAnswer: 5 },
  { id: "north", name: "Northline HVAC", channels: ["google_ads", "meta"], leads: 1215, quality: 63, provisional: false, alerts: 0, match: 0.46, pixelHours: 1, scale: 0, learning: 4, cut: 0, answered: 14, booked: 3, noAnswer: 4 },
  { id: "pike", name: "Pike Street Law", channels: ["meta"], leads: 2460, quality: 71, provisional: false, alerts: 1, match: 0.52, pixelHours: 1, scale: 1, learning: 1, cut: 1, answered: 16, booked: 5, noAnswer: 3 },
];

export async function ensureLoginAnalyticsDemo(prisma: PrismaClient) {
  if (!clientConfig().sampleData) return;
  const today = zonedISODate(new Date(), ZONE);
  const past = new Date(Date.now() - 3 * 24 * 3600 * 1000);
  const ingestedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

  for (const client of CLIENTS) {
    await prisma.workspace.upsert({
      where: { id: client.id },
      create: { id: client.id, name: client.name, voiceEnabled: client.id === "org" },
      update: client.id === "org" ? {} : { name: client.name },
    });
    for (const platform of client.channels) {
      await prisma.platformConnection.upsert({
        where: { workspaceId_platform: { workspaceId: client.id, platform } },
        create: {
          id: `demo_${client.id}_${platform}_conn`,
          workspaceId: client.id,
          platform,
          authType: "internal",
          secretRef: "demo",
          status: "connected",
          createdAt: past,
        },
        update: { status: "connected" },
      });
    }
    const connectionId = `demo_${client.id}_${client.channels[0]}_conn`;
    const accountId = `demo_${client.id}_account`;
    await prisma.adAccount.upsert({
      where: { workspaceId_platform_externalId: { workspaceId: client.id, platform: client.channels[0], externalId: `demo-${client.id}` } },
      create: {
        id: accountId,
        workspaceId: client.id,
        connectionId,
        platform: client.channels[0],
        externalId: `demo-${client.id}`,
        name: `${client.name} ads`,
        currency: "USD",
        timezone: ZONE,
        status: "active",
      },
      update: { status: "active" },
    });
    const segmentId = `demo_${client.id}_segment`;
    await prisma.audienceSegment.upsert({
      where: { workspaceId_kind_segmentKey: { workspaceId: client.id, kind: "targeting", segmentKey: "all" } },
      create: { id: segmentId, workspaceId: client.id, kind: "targeting", segmentKey: "all", label: "All" },
      update: {},
    });
    const adId = `demo_${client.id}_ad`;
    for (let index = 0; index < 3; index += 1) {
      const campaignId = `demo_${client.id}_c${index}`;
      await prisma.campaign.upsert({
        where: { workspaceId_platform_externalId: { workspaceId: client.id, platform: client.channels[0], externalId: campaignId } },
        create: {
          id: campaignId,
          workspaceId: client.id,
          adAccountId: accountId,
          platform: client.channels[0],
          externalId: campaignId,
          name: `${client.name} ${index + 1}`,
          status: "active",
          createdAt: past,
        },
        update: { status: "active" },
      });
      if (index === 0) {
        const groupId = `demo_${client.id}_group`;
        await prisma.adGroup.upsert({
          where: { workspaceId_platform_externalId: { workspaceId: client.id, platform: client.channels[0], externalId: groupId } },
          create: { id: groupId, workspaceId: client.id, campaignId, platform: client.channels[0], externalId: groupId, name: "Primary", status: "active" },
          update: {},
        });
        await prisma.ad.upsert({
          where: { workspaceId_platform_externalId: { workspaceId: client.id, platform: client.channels[0], externalId: adId } },
          create: { id: adId, workspaceId: client.id, adGroupId: groupId, platform: client.channels[0], externalId: adId, name: "Primary ad", status: "active" },
          update: {},
        });
      }
    }

    await prisma.dailyMetric.deleteMany({ where: { workspaceId: client.id, adId } });
    const metrics: Prisma.DailyMetricCreateManyInput[] = [];
    for (let age = 0; age < 30; age += 1) {
      const date = addDaysISO(today, -age);
      const wave = 0.75 + 0.25 * Math.sin(age / 3);
      metrics.push({
        id: `demo_${client.id}_${date}`,
        workspaceId: client.id,
        date: new Date(`${date}T00:00:00.000Z`),
        platform: client.channels[0],
        campaignId: `demo_${client.id}_c0`,
        adId,
        audienceSegmentId: segmentId,
        attributionWindow: "7d_click",
        platformLeads: Math.max(1, Math.round((client.leads / 30) * wave)),
        spend: Math.round((client.leads / 30) * wave * 4.2),
        impressions: Math.round((client.leads / 30) * wave * 40),
        clicks: Math.round((client.leads / 30) * wave * 3),
        ingestedAt,
      });
    }
    await prisma.dailyMetric.createMany({ data: metrics });

    const conversion = await prisma.conversionClient.upsert({
      where: { workspaceId_name: { workspaceId: client.id, name: client.name } },
      create: { id: `demo_${client.id}_conversion`, workspaceId: client.id, name: client.name },
      update: {},
    });
    const eventCount = 12;
    for (let index = 0; index < eventCount; index += 1) {
      const when = new Date(Date.now() - (index + 2) * 12 * 3600 * 1000);
      const matched = index / eventCount < client.match;
      const kind = !client.provisional && index === 0 ? "booked" : "qualified";
      await prisma.conversionEvent.upsert({
        where: { clientId_externalId_kind: { clientId: conversion.id, externalId: `demo_${client.id}_${index}`, kind } },
        create: {
          id: `demo_${client.id}_evt_${index}`,
          clientId: conversion.id,
          source: "demo",
          externalId: `demo_${client.id}_${index}`,
          kind,
          stageName: kind,
          occurredAt: when,
          gclid: matched ? `demo-${client.id}-${index}` : "",
        },
        update: { occurredAt: when, gclid: matched ? `demo-${client.id}-${index}` : "" },
      });
    }

    await prisma.leadScore.deleteMany({ where: { id: { startsWith: `demo_${client.id}_score_` } } });
    for (let index = 0; index < 5; index += 1) {
      const scoreContact = `demo_${client.id}_score_contact_${index}`;
      const slot = CLIENTS.indexOf(client);
      await prisma.contact.upsert({
        where: { id: scoreContact },
        create: {
          id: scoreContact,
          name: "Demo lead",
          phone: `+15551${String(slot).padStart(2, "0")}${index}00`,
          source: "Demo",
          createdAt: past,
        },
        update: {},
      });
      await prisma.leadScore.create({
        data: {
          id: `demo_${client.id}_score_${index}`,
          workspaceId: client.id,
          contactId: scoreContact,
          label: "qualified",
          score: client.quality + (index - 2),
          reason: "Demo score",
          createdAt: new Date(Date.now() - (index + 1) * 86400000),
        },
      });
    }

    const contactId = `demo_${client.id}_contact`;
    await prisma.contact.upsert({
      where: { id: contactId },
      create: { id: contactId, name: "Demo caller", phone: `+1555000${client.id.length}${CLIENTS.indexOf(client)}000`, source: "Demo", createdAt: past },
      update: {},
    });

    await prisma.recommendation.deleteMany({ where: { id: { startsWith: `demo_${client.id}_rec_` } } });
    const recs: Prisma.RecommendationCreateManyInput[] = [];
    for (let index = 0; index < client.scale; index += 1) {
      recs.push(rec(client.id, `scale_${index}`, "performance", "verified", "Scale"));
    }
    for (let index = 0; index < client.learning; index += 1) {
      recs.push(rec(client.id, `learn_${index}`, "traffic", "draft", "Learning"));
    }
    for (let index = 0; index < client.cut; index += 1) {
      recs.push(rec(client.id, `cut_${index}`, "creative_fatigue", "accepted", "Cut"));
    }
    if (recs.length) await prisma.recommendation.createMany({ data: recs });

    const calls = client.answered + client.noAnswer;
    for (let index = 0; index < calls; index += 1) {
      const booked = index < client.booked;
      const answered = index < client.answered;
      const when = new Date(Date.now() - (index + 2) * 24 * 3600 * 1000 - 2 * 3600 * 1000);
      const callId = `demo_${client.id}_call_${index}`;
      await prisma.call.upsert({
        where: { id: callId },
        create: {
          id: callId,
          contactId,
          status: "completed",
          outcome: booked ? "booked" : answered ? "callback_requested" : "no_answer",
          connected: answered,
          booked,
          startedAt: when,
          triggeredAt: when,
          createdAt: when,
        },
        update: {
          connected: answered,
          booked,
          outcome: booked ? "booked" : answered ? "callback_requested" : "no_answer",
          startedAt: when,
          triggeredAt: when,
        },
      });
      await prisma.leadResponse.upsert({
        where: { id: `demo_${client.id}_lead_${index}` },
        create: {
          id: `demo_${client.id}_lead_${index}`,
          workspaceId: client.id,
          callId,
          name: "Demo lead",
          clockStartAt: when,
          clockSource: "form_submit",
          slaStartAt: when,
          firstTouchAt: answered ? new Date(when.getTime() + 42000) : null,
          seconds: answered ? 42 + index : null,
          channel: answered ? "human" : null,
        },
        update: {
          seconds: answered ? 42 + index : null,
          clockStartAt: when,
          slaStartAt: when,
          firstTouchAt: answered ? new Date(when.getTime() + 42000) : null,
        },
      });
    }

    if (client.alerts > 0) {
      await prisma.leadAlert.upsert({
        where: { dedupeKey_severity: { dedupeKey: `demo_${client.id}_alert`, severity: "warning" } },
        create: {
          id: `demo_${client.id}_alert`,
          workspaceId: client.id,
          leadResponseId: `demo_${client.id}_lead_0`,
          severity: "warning",
          code: "waiting",
          title: "A lead is still waiting",
          summary: "Demo alert",
          dedupeKey: `demo_${client.id}_alert`,
          state: "open",
          detectedAt: ingestedAt,
        },
        update: { state: "open" },
      });
    }

    const marketingClient = await prisma.marketingClient.upsert({
      where: { workspaceId_name: { workspaceId: client.id, name: client.name } },
      create: { id: `demo_${client.id}_mclient`, workspaceId: client.id, name: client.name },
      update: {},
    });
    const page = await prisma.landingPage.upsert({
      where: { workspaceId_url: { workspaceId: client.id, url: `https://demo.specificityinc.example/${client.id}` } },
      create: {
        id: `demo_${client.id}_page`,
        workspaceId: client.id,
        clientKey: marketingClient.id,
        name: `${client.name} landing`,
        url: `https://demo.specificityinc.example/${client.id}`,
      },
      update: {},
    });
    await prisma.pageCheck.deleteMany({ where: { landingPageId: page.id } });
    await prisma.pageCheck.create({
      data: {
        id: `demo_${client.id}_check`,
        landingPageId: page.id,
        region: "us",
        status: "up",
        pixels: { meta: true, gtag: true, gtm: true },
        checkedAt: new Date(Date.now() - client.pixelHours * 3600 * 1000),
      },
    });
  }
  console.log("Login analytics demo: 6 clients.");
}

function rec(workspaceId: string, key: string, type: "performance" | "traffic" | "creative_fatigue", status: "verified" | "draft" | "accepted", title: string): Prisma.RecommendationCreateManyInput {
  return {
    id: `demo_${workspaceId}_rec_${key}`,
    workspaceId,
    type,
    status,
    title,
    summary: "Recommendation only.",
    rationale: "Demo mix. Nothing is published.",
    metric: "leads",
    baseline: "1",
    observed: "1",
    sampleSize: 20,
    evidence: {},
  };
}

if (process.argv[1]?.includes("seed-login-analytics")) {
  const prisma = new PrismaClient();
  ensureLoginAnalyticsDemo(prisma)
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
