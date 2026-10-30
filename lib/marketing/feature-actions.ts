"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffUser } from "../auth";
import { denyAccess } from "../deny";
import { competitorWatchEnabled, holdoutsEnabled, searchWasteEnabled } from "./config";
import { canDesignHoldout, canStartHoldout } from "./holdouts";
import { accountFilter, campaignAllowed, canReviewSearchWaste, canWatchCompetitors } from "./feature-access";
import { loadMarketingAccess } from "./queries";
import { addCompetitor, createCompetitorIdea, refreshCompetitorAds, removeCompetitor } from "./competitor-store";
import {
  computeHoldoutReadout,
  createHoldoutTest,
  listCampaignChoices,
  recordLiftObservation,
  startHoldoutTest,
  undoHoldoutStart,
} from "./holdout-store";
import { analyzeStoredSearchTerms, ingestSearchTermRows, listAdAccountChoices, saveSearchWasteConfig, setProposalDisposition } from "./search-waste-store";
import { parseSearchTermsReport } from "./search-waste";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function words(value: FormDataEntryValue | null) {
  return [...new Set(String(value || "").split(/[\n,]/).map((part) => part.trim()).filter(Boolean))];
}

export async function importSearchTerms(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (!searchWasteEnabled() || !canReviewSearchWaste(access)) denyAccess();
  const adAccountId = String(formData.get("adAccountId") || "");
  const accounts = await listAdAccountChoices(access.workspaceId);
  const account = accounts.find((row) => row.id === adAccountId);
  const allowed = accountFilter(access);
  if (!account || (allowed !== "all" && !allowed.includes(account.id))) fail("/marketing/search-waste", "Choose an ad account in this workspace.");
  const report = String(formData.get("report") || "");
  const rows = parseSearchTermsReport(report, { workspaceId: access.workspaceId, adAccountId: account.id, currency: account.currency });
  if (!rows.length) fail("/marketing/search-waste", "That file has no search terms. Export the search terms report from Google Ads and paste it here.");
  const brandTerms = words(formData.get("brandTerms"));
  const otherLocations = words(formData.get("otherLocations"));
  await saveSearchWasteConfig(access.workspaceId, { brandTerms, otherLocations });
  await ingestSearchTermRows(access.workspaceId, rows);
  await analyzeStoredSearchTerms(access.workspaceId, allowed);
  revalidatePath("/marketing/search-waste");
}

export async function saveSearchChoices(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (!searchWasteEnabled() || !canReviewSearchWaste(access)) denyAccess();
  const keeps = formData.getAll("keep").map(String);
  const blocks = formData.getAll("block").map(String);
  for (const id of keeps) await setProposalDisposition(access.workspaceId, id, "keep", user.id);
  for (const id of blocks) await setProposalDisposition(access.workspaceId, id, "block", user.id);
  revalidatePath("/marketing/search-waste");
}

export async function addCompetitorAction(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (!competitorWatchEnabled() || !canWatchCompetitors(access)) denyAccess();
  const result = await addCompetitor(access.workspaceId, user.id, {
    name: String(formData.get("name") || ""),
    pageId: String(formData.get("pageId") || ""),
    website: String(formData.get("website") || ""),
    searchTerms: words(formData.get("searchTerms")),
  });
  if (!result.ok) fail("/marketing/competitors", result.message);
  revalidatePath("/marketing/competitors");
}

export async function removeCompetitorAction(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (!competitorWatchEnabled() || !canWatchCompetitors(access)) denyAccess();
  await removeCompetitor(access.workspaceId, String(formData.get("id") || ""));
  revalidatePath("/marketing/competitors");
}

export async function refreshCompetitorsAction() {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (!competitorWatchEnabled() || !canWatchCompetitors(access)) denyAccess();
  await refreshCompetitorAds(access.workspaceId);
  revalidatePath("/marketing/competitors");
}

export async function draftCompetitorIdeaAction(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (!competitorWatchEnabled() || !canWatchCompetitors(access)) denyAccess();
  const result = await createCompetitorIdea(access.workspaceId, user.id, String(formData.get("adId") || ""));
  if (!result.ok) fail("/marketing/competitors", result.message);
  revalidatePath("/marketing/competitors");
}

export async function createHoldoutAction(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (!holdoutsEnabled() || !canDesignHoldout(access)) denyAccess();
  const campaignId = String(formData.get("campaignId") || "");
  const campaigns = await listCampaignChoices(access.workspaceId);
  const campaign = campaigns.find((row) => row.id === campaignId);
  if (!campaign || !campaignAllowed(access, campaign)) fail("/marketing/holdouts", "Choose a campaign in this workspace.");
  const kind = String(formData.get("kind") || "geo");
  const metric = String(formData.get("metric") || "leads");
  const result = await createHoldoutTest(access.workspaceId, user.id, {
    campaignId: campaign.id,
    adAccountId: campaign.adAccountId,
    question: String(formData.get("question") || ""),
    name: String(formData.get("name") || ""),
    kind: kind === "time" || kind === "audience" ? kind : "geo",
    metric: metric === "bookings" || metric === "conversions" ? metric : "leads",
    holdoutPercent: Number(formData.get("holdoutPercent") || 10),
    units: words(formData.get("units")),
    startDate: String(formData.get("startDate") || ""),
    endDate: String(formData.get("endDate") || ""),
    preStartDate: String(formData.get("preStartDate") || "") || undefined,
    minSample: Number(formData.get("minSample") || 30),
  });
  if (!result.ok) fail("/marketing/holdouts", result.error);
  revalidatePath("/marketing/holdouts");
}

export async function startHoldoutAction(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (!holdoutsEnabled() || !canStartHoldout(access)) denyAccess();
  const count = await startHoldoutTest(access.workspaceId, user.id, String(formData.get("testId") || ""));
  if (!count) fail("/marketing/holdouts", "Only a draft test can be started, and only by a super admin.");
  revalidatePath("/marketing/holdouts");
}

export async function undoHoldoutAction(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (!holdoutsEnabled() || !canStartHoldout(access)) denyAccess();
  const count = await undoHoldoutStart(access.workspaceId, String(formData.get("testId") || ""));
  if (!count) fail("/marketing/holdouts", "The undo window has closed. The ad account was not changed.");
  revalidatePath("/marketing/holdouts");
}

export async function recordLiftAction(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (!holdoutsEnabled() || !canDesignHoldout(access)) denyAccess();
  const period = String(formData.get("period") || "") === "pre" ? "pre" : "post";
  const result = await recordLiftObservation(access.workspaceId, String(formData.get("testId") || ""), {
    unitKey: String(formData.get("unitKey") || ""),
    period,
    outcome: Number(formData.get("outcome") || 0),
    spend: Number(formData.get("spend") || 0),
    impressions: Number(formData.get("impressions") || 0),
  }, access.seesCost);
  if (!result.ok) fail("/marketing/holdouts", result.message);
  revalidatePath("/marketing/holdouts");
}

export async function computeHoldoutAction(formData: FormData) {
  const user = await requireStaffUser();
  const access = await loadMarketingAccess(user);
  if (!holdoutsEnabled() || !canDesignHoldout(access)) denyAccess();
  const view = await computeHoldoutReadout(access.workspaceId, String(formData.get("testId") || ""), access.seesCost);
  if (!view) fail("/marketing/holdouts", "That test is not in this workspace.");
  revalidatePath("/marketing/holdouts");
}
