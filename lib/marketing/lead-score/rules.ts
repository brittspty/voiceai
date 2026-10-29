import { digitsOnly } from "../../phone";
import type { LeadClassification, LeadInput, LeadLabel } from "./types";

const DISPOSABLE_DOMAINS = [
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "yopmail.com",
  "10minutemail.com",
  "trashmail.com",
  "sharklasers.com",
  "dispostable.com",
  "getnada.com",
  "maildrop.cc",
];

const SPAM_PHRASES = [
  "viagra",
  "cialis",
  "crypto",
  "bitcoin",
  "seo service",
  "buy followers",
  "casino",
  "lottery",
  "you have won",
  "you won",
  "nigerian",
  "click here",
  "limited time",
  "act now",
  "make money fast",
  "wire transfer",
  "congratulations",
];

const INTENT_PHRASES = [
  "quote",
  "estimate",
  "inspection",
  "inspector",
  "appointment",
  "schedule",
  "come out",
  "repair",
  "install",
  "interested",
  "call me",
  "this week",
  "tomorrow",
  "yes please",
  "that works",
  "free inspection",
  "look at",
  "i need",
];

const REFUSAL_PHRASES = [
  "not interested",
  "stop calling",
  "do not call",
  "don't call",
  "remove me",
  "wrong number",
  "no thanks",
  "take me off",
  "wrong area",
  "don't service",
  "do not service",
  "already a customer",
  "price shopping",
  "not ready",
];

const OUTCOME_REASONS: Record<string, string> = {
  not_interested: "Said they are not interested",
  wrong_number: "Wrong number",
  no_answer: "No answer",
  voicemail: "Voicemail only",
  failed: "Call did not connect",
};

type Vote = { label: LeadLabel; weight: number; reason: string };

function phrase(haystack: string, value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

function emailDomain(email: string | null) {
  const domain = (email || "").trim().toLowerCase().split("@")[1] || "";
  return domain;
}

function fakePhone(phone: string) {
  const digits = digitsOnly(phone);
  if (digits.length < 10 || digits.length > 15) return true;
  if (/^(\d)\1+$/.test(digits)) return true;
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (/^(\d)\1+$/.test(national)) return true;
  if (national === "1234567890" || national === "0123456789") return true;
  return false;
}

function gibberishName(name: string) {
  const cleaned = name.trim().toLowerCase();
  if (!cleaned) return false;
  if (/\btest\b/.test(cleaned)) return true;
  if (/^(asdf+|qwerty|xxx+|aaa+|fake|spam|abc|zzz+)\b/.test(cleaned)) return true;
  const letters = cleaned.replace(/[^a-z]/g, "");
  if (letters.length >= 3 && !/[aeiouy]/.test(letters)) return true;
  if (/^(.)\1{2,}$/.test(letters)) return true;
  return false;
}

function plausibleName(name: string) {
  const cleaned = name.trim();
  if (cleaned.length < 2) return false;
  if (gibberishName(cleaned)) return false;
  return /[a-z]/i.test(cleaned);
}

function keep(votes: Vote[], label: LeadLabel, weight: number, reason: string) {
  const current = votes.find((vote) => vote.label === label);
  if (!current || weight > current.weight) {
    if (current) {
      current.weight = weight;
      current.reason = reason;
    } else {
      votes.push({ label, weight, reason });
    }
  }
}

/** First-pass labels. Confident spam, do-not-call, duration, and booking signals land here. */
export function scoreWithRules(input: LeadInput): LeadClassification {
  const votes: Vote[] = [];
  const haystack = [input.name, input.email, input.message, input.transcript].filter(Boolean).join(" ");
  const domain = emailDomain(input.email);
  if (domain && DISPOSABLE_DOMAINS.includes(domain)) {
    keep(votes, "spam", 98, "Email address is from a disposable inbox");
  }
  if (fakePhone(input.phone)) {
    keep(votes, "spam", 94, "Phone number is not a real number");
  }
  if (gibberishName(input.name) || phrase(input.message, "this is a test") || phrase(haystack, "test lead")) {
    keep(votes, "spam", 92, "Name or note looks like a test or junk entry");
  }
  for (const spam of SPAM_PHRASES) {
    if (phrase(haystack, spam)) {
      keep(votes, "spam", 96, "Message matches a spam pattern");
      break;
    }
  }
  if (input.onDoNotCall) {
    keep(votes, "unqualified", 97, "On the do-not-call list");
  }
  const outcome = (input.outcome || "").trim();
  if (OUTCOME_REASONS[outcome]) {
    keep(votes, "unqualified", 89, OUTCOME_REASONS[outcome]);
  }
  if (input.kind === "call" && input.durationSec != null && input.durationSec < 15 && outcome !== "booked") {
    keep(votes, "unqualified", 84, "Call was too short to qualify");
  }
  for (const refusal of REFUSAL_PHRASES) {
    if (phrase(haystack, refusal)) {
      keep(votes, "unqualified", 90, "Asked not to be contacted or is not a fit");
      break;
    }
  }
  if (outcome === "booked") {
    keep(votes, "qualified", 95, "Booked a time");
  }
  for (const intent of INTENT_PHRASES) {
    if (phrase(haystack, intent)) {
      keep(votes, "qualified", 88, "Asked for service, a quote, or a time");
      break;
    }
  }
  if (input.kind === "form" && plausibleName(input.name) && !fakePhone(input.phone)) {
    keep(votes, "qualified", 66, "Contact details look real");
  }
  if (input.kind === "call" && !votes.some((vote) => vote.label === "qualified" || vote.label === "unqualified" || vote.label === "spam")) {
    keep(votes, "unqualified", 58, "No clear request for service");
  }

  votes.sort((a, b) => b.weight - a.weight);
  const top = votes[0];
  if (!top || top.weight <= 0) {
    return {
      label: input.kind === "call" ? "unqualified" : "qualified",
      score: 50,
      reason: input.kind === "call" ? "No clear request for service" : "Contact details look real",
      model: "rules",
    };
  }
  return { label: top.label, score: Math.min(99, top.weight), reason: top.reason, model: "rules" };
}

export function rulesAreConfident(result: LeadClassification, threshold = 80) {
  return result.score >= threshold;
}
