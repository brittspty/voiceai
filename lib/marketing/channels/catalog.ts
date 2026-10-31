import { PRODUCT_NAME } from "../../brand";
import type { LiveFeedItem } from "./feed";
import type { InboxCard } from "./decisions";

export const EXAMPLE_ASSIGNMENTS = {
  dana: ["harbor", "gulf", "coastal"],
};

export const EXAMPLE_FEED: LiveFeedItem[] = [
  { id: "f-1043", clientId: "gulf", clientName: "Gulf Pest", channel: "Landing page", severity: "urgent", title: "/spring-offer is down: 3 failed checks. 2 Meta ads still point there.", reason: "Auto-pause pending approval. Pause by hand.", decisionId: "D-1043", createdAt: "2026-10-30T21:44:00-04:00", unread: true, driver: "landing_page", magnitude: 3 },
  { id: "f-1042", clientId: "harbor", clientName: "Harbor Dental", channel: "Meta", severity: "decision", title: "Rotate Smile Again 55+: clicks down 31% over 5 days, seen 4.2x.", reason: "High 88% · Credit window 9-day click (learned)", decisionId: "D-1042", createdAt: "2026-10-30T21:31:00-04:00", unread: true, driver: "creative_fatigue", magnitude: 31 },
  { id: "f-1047", clientId: "harbor", clientName: "Harbor Dental", channel: "Google Ads", severity: "decision", title: "Block free dental work: 0 leads in 14 days.", reason: "High 91%", decisionId: "D-1047", createdAt: "2026-10-30T21:20:00-04:00", unread: true, driver: "search_term_shift", magnitude: 96 },
  { id: "f-1050", clientId: "coastal", clientName: "Coastal Roofing", channel: "Google Ads", severity: "note", title: "CTR up on 3 storm keywords. No action needed.", reason: "Batched 9:00–9:40 PM", decisionId: "D-1050", createdAt: "2026-10-30T21:40:00-04:00", unread: false, driver: "normal_noise", magnitude: 12 },
  { id: "f-1046", clientId: "harbor", clientName: "Harbor Dental", channel: "Google Business Profile", severity: "note", title: "2 new 5-star reviews. Calls from Maps up 40% this week.", reason: "9:05 PM", decisionId: "D-1046", createdAt: "2026-10-30T21:05:00-04:00", unread: false, driver: "review_change", magnitude: 40 },
  { id: "f-secret", clientId: "other", clientName: "Other Client", channel: "Meta", severity: "urgent", title: "Hidden from Dana", reason: "Assigned to someone else", decisionId: "D-1999", createdAt: "2026-10-30T21:50:00-04:00", unread: true, driver: "landing_page", magnitude: 9 },
];

export const EXAMPLE_DECISIONS: InboxCard[] = [
  { id: "D-1045", kind: "budget_recommendation", status: "waiting", tier: "staff", title: "Move $40/day from StackAdapt to Google Ads search", reasoning: `${PRODUCT_NAME} never edits budgets. You make the change, then tell ${PRODUCT_NAME}.`, clientName: "Harbor Dental", assigneeId: "dana", campaignId: "harbor-search", adAccountId: "g-1", confidence: 86, serve: null, creditWindowLabel: "", automatic: false, steps: ["In StackAdapt, lower Harbor Display Q4 from $120 to $80/day.", "In Google Ads, raise Harbor Implants Search from $90 to $130/day.", "Come back and tap I made the change."] },
  { id: "D-1042", kind: "fatigue_rotation", status: "waiting", tier: "staff", title: "Rotate Smile Again 55+", reasoning: "Rotate: clicks down 31% over 5 days and people have seen it 4.2 times on average, so it's wearing out.", clientName: "Harbor Dental", assigneeId: "dana", campaignId: "harbor-implants", adAccountId: "m-1", confidence: 88, serve: "rotate", creditWindowLabel: "Credit window: 9-day click (learned)", automatic: false, steps: [] },
  { id: "D-1049", kind: "fatigue_pause", status: "waiting", tier: "staff", title: "Pause Before/After", reasoning: `Pause (your call): 0 leads across the credit window. ${PRODUCT_NAME} will not pause it.`, clientName: "Harbor Dental", assigneeId: "dana", campaignId: "harbor-implants", adAccountId: "m-1", confidence: 71, serve: "pause", creditWindowLabel: "Credit window: 9-day click (learned)", automatic: false, steps: [] },
  { id: "D-1043", kind: "page_alert", status: "waiting", tier: "staff", title: "/spring-offer has failed 3 checks", reasoning: "Auto-pause pending approval. Pause by hand for now.", clientName: "Gulf Pest", assigneeId: "dana", campaignId: null, adAccountId: "m-1", confidence: 96, serve: null, creditWindowLabel: "", automatic: false, steps: [] },
  { id: "D-1047", kind: "negative_keyword", status: "waiting", tier: "staff", title: "Block free dental work", reasoning: "That search term brought 0 leads.", clientName: "Gulf Pest", assigneeId: "dana", campaignId: "gulf-search", adAccountId: "g-1", confidence: 91, serve: null, creditWindowLabel: "", automatic: false, steps: [] },
  { id: "D-1048", kind: "creative_approval", status: "waiting", tier: "client", title: "Keep serving Free Consult", reasoning: "Serve: cheapest lead here and clicks rising.", clientName: "Harbor Dental", assigneeId: null, campaignId: "harbor-implants", adAccountId: "m-1", confidence: 84, serve: "serve", creditWindowLabel: "Credit window: 9-day click (learned)", automatic: false, steps: [] },
  { id: "D-1101", kind: "lead_check", status: "waiting", tier: "client", title: "Was Maria G. a good lead?", reasoning: "She asked about implants from your Google ad yesterday.", clientName: "Harbor Dental", assigneeId: null, campaignId: null, adAccountId: null, confidence: 70, serve: null, creditWindowLabel: "", automatic: false, steps: [] },
];

/** Client channel payload. Cost fields are absent before the server strips again. */
export function clientChannelPayload() {
  return {
    channel: "Facebook & Instagram ads",
    leads: 72,
    qualified: 22,
    booked: 9,
    ctr: 0.012,
    ads: [
      { name: "Free Consult carousel", leads: 31, qualified: 11, booked: 5, status: "Working well" },
      { name: "Smile Again 55+ video", leads: 24, qualified: 6, booked: 2, status: "Getting tired, new version coming" },
    ],
    example: true,
  };
}
