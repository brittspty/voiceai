import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exampleReportSource } from "./example-source";
import type { ReportMetricsSource } from "./types";

/**
 * Reports read through this switch.
 * The cross-channel model (bc-e4d5d029) should add
 * `lib/marketing/cross-channel/report-source.ts` and export `createReportSource()`.
 * Until that file exists, Reports v2 uses the example source.
 */
const CROSS_CHANNEL_FILES = [
  path.join("lib", "marketing", "cross-channel", "report-source.ts"),
  path.join("lib", "marketing", "cross-channel", "report-source.js"),
];

let registered: ReportMetricsSource | null = null;
let probed: ReportMetricsSource | null | undefined;

export function registerReportSource(source: ReportMetricsSource | null) {
  registered = source;
  probed = undefined;
}

export function crossChannelModulePath() {
  return CROSS_CHANNEL_FILES.map((file) => path.join(process.cwd(), file)).find((file) => existsSync(file)) ?? null;
}

export async function loadCrossChannelSource(): Promise<ReportMetricsSource | null> {
  if (probed !== undefined) return probed;
  const file = crossChannelModulePath();
  if (!file) {
    probed = null;
    return null;
  }
  try {
    const importer = new Function("href", "return import(href)") as (href: string) => Promise<{ createReportSource?: () => ReportMetricsSource }>;
    const mod = await importer(pathToFileURL(file).href);
    probed = mod.createReportSource?.() ?? null;
  } catch {
    probed = null;
  }
  return probed;
}

export async function selectReportSource(): Promise<ReportMetricsSource> {
  if (registered?.available()) return registered;
  const external = await loadCrossChannelSource();
  if (external?.available()) return external;
  return exampleReportSource;
}
