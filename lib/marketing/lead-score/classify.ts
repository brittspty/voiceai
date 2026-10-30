import type { Env } from "../config";
import { rulesAreConfident, scoreWithRules } from "./rules";
import type { LeadClassification, LeadInput, LeadLabel } from "./types";
import { LEAD_LABELS } from "./types";

export interface LeadClassifier {
  model: string;
  classify(input: LeadInput): Promise<{ label: LeadLabel; score: number; reason: string } | null>;
}

const DEFAULT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /\+?\d[\d\s().-]{8,}\d/g;

/** Strip addresses and numbers from free text before it leaves the server. */
export function scrubContactText(value: string) {
  return value.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
}

function dropName(value: string, name: string) {
  const full = name.trim();
  const parts = full.split(/\s+/).filter((part) => part.length >= 3);
  let next = value;
  for (const phrase of [full, ...parts]) {
    if (phrase.length < 3) continue;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "[name]");
  }
  return next;
}

/** The model sees the conversation, not the person's name, phone, or email. */
export function redactLeadForModel(input: LeadInput): LeadInput {
  const text = (value: string) => dropName(scrubContactText(value), input.name);
  return {
    kind: input.kind,
    name: "",
    phone: "",
    email: null,
    message: text(input.message),
    transcript: text(input.transcript),
    durationSec: input.durationSec,
    outcome: input.outcome,
    onDoNotCall: input.onDoNotCall,
  };
}

export function parseModelContent(content: string): { label: LeadLabel; score: number; reason: string } | null {
  const stripped = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1)) as { label?: unknown; score?: unknown; reason?: unknown };
    const label = typeof parsed.label === "string" ? parsed.label.trim().toLowerCase() : "";
    if (!LEAD_LABELS.includes(label as LeadLabel)) return null;
    const score = Number(parsed.score);
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 280) : "";
    if (!reason || !Number.isFinite(score)) return null;
    return { label: label as LeadLabel, score: Math.max(0, Math.min(99, Math.round(score))), reason };
  } catch {
    return null;
  }
}

export function parseModelResponse(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const record = body as { choices?: { message?: { content?: unknown } }[]; label?: unknown };
  const content = record.choices?.[0]?.message?.content;
  if (typeof content === "string") return parseModelContent(content);
  return null;
}

export function modelRequest(input: LeadInput, env: Env) {
  const key = (env.LEAD_SCORING_API_KEY || "").trim();
  const model = (env.LEAD_SCORING_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const url = (env.LEAD_SCORING_API_URL || DEFAULT_URL).trim() || DEFAULT_URL;
  const safe = redactLeadForModel(input);
  const prompt = [
    "Classify this lead as qualified, unqualified, or spam.",
    "Reply with JSON only: {\"label\":\"qualified|unqualified|spam\",\"score\":0-99,\"reason\":\"short phrase\"}.",
    `Kind: ${safe.kind}`,
    `Outcome: ${safe.outcome || ""}`,
    `Duration seconds: ${safe.durationSec ?? ""}`,
    `Do not call: ${safe.onDoNotCall ? "yes" : "no"}`,
    `Form note: ${safe.message}`,
    `Transcript: ${safe.transcript.slice(0, 4000)}`,
  ].join("\n");
  return {
    url,
    model,
    key,
    body: {
      model,
      temperature: 0,
      messages: [
        { role: "system", content: "You label sales leads. Return JSON only." },
        { role: "user", content: prompt },
      ],
    },
  };
}

export function classifierFromEnv(env: Env, fetchImpl: typeof fetch = fetch): LeadClassifier | null {
  const request = modelRequest(
    { kind: "form", name: "", phone: "", email: null, message: "", transcript: "", durationSec: null, outcome: null, onDoNotCall: false },
    env,
  );
  if (!request.key) return null;
  const model = request.model;
  return {
    model,
    async classify(input) {
      const built = modelRequest(input, env);
      if (built.body.messages.some((message) => message.content.includes(built.key))) return null;
      const response = await fetchImpl(built.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${built.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(built.body),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      return parseModelResponse(await response.json());
    },
  };
}

/**
 * Rules run first. A confident rule result is final.
 * The model is asked only when the rules are unsure and a provider exists.
 * Any model failure keeps the rule result.
 */
export async function classifyLead(input: LeadInput, options: { provider?: LeadClassifier | null; threshold?: number } = {}): Promise<LeadClassification> {
  const rules = scoreWithRules(input);
  const provider = options.provider;
  if (!provider || rulesAreConfident(rules, options.threshold ?? 80)) return rules;
  try {
    const model = await provider.classify(redactLeadForModel(input));
    if (!model) return rules;
    return { label: model.label, score: model.score, reason: model.reason, model: provider.model };
  } catch {
    return rules;
  }
}
