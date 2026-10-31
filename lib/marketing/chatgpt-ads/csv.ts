import { DEFAULT_CLICK_DAYS, DEFAULT_VIEW_DAYS, SPEND_LAG_HOURS, interpretSpend, type ChatgptReportRow, type SpendUnit } from "./reporting";

const HEADER_ALIASES: Record<string, string> = {
  date: "date",
  day: "date",
  reportingday: "date",
  campaignid: "campaignId",
  campaign: "campaignName",
  campaignname: "campaignName",
  adgroupid: "adGroupId",
  adsetid: "adGroupId",
  adgroup: "adGroupName",
  adgroupname: "adGroupName",
  adsetname: "adGroupName",
  adid: "adId",
  adname: "adName",
  ad: "adName",
  impressions: "impressions",
  clicks: "clicks",
  spend: "spend",
  amountspent: "spend",
  cost: "spend",
  spendmicros: "spendMicros",
  amountspentmicros: "spendMicros",
  conversions: "conversions",
  currency: "currency",
  country: "country",
  device: "device",
  platform: "platform",
};

function canonHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function splitCsv(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

/** Ads Manager export. Spend columns are dollars unless the header says micros. */
export function parseAdsManagerCsv(csv: string): { rows: ChatgptReportRow[]; errors: string[] } {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], errors: ["The CSV is empty."] };
  const headers = splitCsv(lines[0] || "").map(canonHeader);
  const fields = headers.map((header) => HEADER_ALIASES[header] || "");
  if (!fields.includes("date")) return { rows: [], errors: ["The CSV needs a date column."] };
  const rows: ChatgptReportRow[] = [];
  const errors: string[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsv(lines[index] || "");
    const record: Record<string, string> = {};
    fields.forEach((field, cell) => {
      if (field) record[field] = cells[cell] || "";
    });
    const date = (record.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`Row ${index + 1} has no date.`);
      continue;
    }
    const unit: SpendUnit = record.spendMicros ? "micros" : "dollars";
    const raw = Number(record.spendMicros || record.spend || "");
    const interpreted = Number.isFinite(raw) && (record.spendMicros || record.spend) ? interpretSpend(raw, unit) : { spend: null, spendUnit: "dollars" as const, spendUnitNeedsVerification: false };
    const entityId = record.adId || record.adGroupId || record.campaignId || "csv";
    const entityName = record.adName || record.adGroupName || record.campaignName || "Ads Manager import";
    const breakdown = [record.country, record.device, record.platform].filter(Boolean).join("|");
    rows.push({
      channel: "chatgpt_ads",
      date,
      entityKey: ["csv", entityId, breakdown].filter(Boolean).join("|"),
      entityName,
      currency: record.currency || "USD",
      impressions: numberOrNull(record.impressions),
      clicks: numberOrNull(record.clicks),
      spend: interpreted.spend,
      conversions: numberOrNull(record.conversions),
      leads: null,
      spendLagHours: SPEND_LAG_HOURS,
      spendUnit: interpreted.spendUnit,
      spendUnitNeedsVerification: false,
      attributionClickDays: DEFAULT_CLICK_DAYS,
      attributionViewDays: DEFAULT_VIEW_DAYS,
      breakdownCountry: record.country || null,
      breakdownDevice: record.device || null,
      breakdownPlatform: record.platform || null,
      granularity: "daily",
      source: "csv",
      deliveryNote: "Imported from an Ads Manager export. Delivery numbers can take about 8 hours to finish.",
    });
  }
  return { rows, errors };
}

function numberOrNull(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
