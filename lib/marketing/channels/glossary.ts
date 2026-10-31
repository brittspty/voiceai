import type { CostAudience } from "./cost-strip";

export type GlossaryEntry = {
  id: string;
  label: string;
  definition: string;
  direction: string;
  staffOnly: boolean;
};

/** Eighteen metrics. Staff-only rows are omitted for client roles and share links. */
export const GLOSSARY: GlossaryEntry[] = [
  { id: "impressions", label: "Impressions", definition: "Times the ad was shown on screen.", direction: "Higher, if leads keep up", staffOnly: false },
  { id: "clicks", label: "Clicks", definition: "Times someone clicked the ad.", direction: "Higher", staffOnly: false },
  { id: "ctr", label: "CTR", definition: "Click-through rate: clicks ÷ impressions.", direction: "Higher", staffOnly: false },
  { id: "frequency", label: "Frequency", definition: "Average times one person saw the ad.", direction: "Lower (warn over 3.5)", staffOnly: false },
  { id: "leads", label: "Leads", definition: "Form fills, calls and messages, once per person.", direction: "Higher", staffOnly: false },
  { id: "qualified_leads", label: "Qualified leads", definition: "Leads marked a real prospect by staff or the client owner.", direction: "Higher", staffOnly: false },
  { id: "qual_rate", label: "Qual. rate", definition: "Qualified ÷ leads.", direction: "Higher", staffOnly: false },
  { id: "conv_rate", label: "Conv. rate", definition: "Leads ÷ clicks.", direction: "Higher", staffOnly: false },
  { id: "booked", label: "Booked", definition: "Qualified leads that booked an appointment.", direction: "Higher", staffOnly: false },
  { id: "speed_to_lead", label: "Speed to lead", definition: "Median time from landing to first contact. The goal is 30 seconds.", direction: "Lower", staffOnly: false },
  { id: "spend", label: "Spend", definition: "What the platform charged this period.", direction: "Closer to plan", staffOnly: true },
  { id: "cpl", label: "CPL", definition: "Spend ÷ leads.", direction: "Lower", staffOnly: true },
  { id: "cpql", label: "Cost per qualified lead", definition: "Spend ÷ qualified leads.", direction: "Lower", staffOnly: true },
  { id: "roas", label: "ROAS", definition: "Revenue ÷ spend, when revenue is synced.", direction: "Higher", staffOnly: true },
  { id: "impression_share", label: "Impression share", definition: "Share of eligible searches where your ad showed.", direction: "Higher", staffOnly: false },
  { id: "search_term", label: "Search term", definition: "The exact words someone searched before seeing the ad.", direction: "n/a", staffOnly: false },
  { id: "gbp_actions", label: "Profile views / Calls / Direction requests", definition: "Actions on the Google Maps listing.", direction: "Higher", staffOnly: false },
  { id: "uptime", label: "Uptime", definition: "Share of checks the page loaded.", direction: "Higher", staffOnly: false },
];

export function glossaryEntry(id: string) {
  return GLOSSARY.find((entry) => entry.id === id) ?? null;
}

export function glossaryFor(audience: CostAudience) {
  if (audience === "staff") return GLOSSARY;
  return GLOSSARY.filter((entry) => !entry.staffOnly);
}
