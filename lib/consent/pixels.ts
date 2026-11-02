import type { ChoiceLevel, VoiceLevel } from "./levels";
import { levelMeets } from "./levels";

/**
 * Our tags, grouped the way Concord groups purposes.
 * Low is functional and loads none of these. Medium loads analytics. High also loads advertising.
 * The widget blocks these until the saved choice allows them. It does not ship a vendor SDK.
 */
export type TrackingTag = {
  id: string;
  label: string;
  kind: "analytics" | "advertising";
  level: VoiceLevel;
  patterns: string[];
};

export const OUR_TRACKING_TAGS: TrackingTag[] = [
  {
    id: "gtag",
    label: "Analytics tag",
    kind: "analytics",
    level: "medium",
    patterns: ["googletagmanager.com/gtag", "google-analytics.com", "gtag("],
  },
  {
    id: "audience-pixel",
    label: "Diver AI pixel",
    kind: "advertising",
    level: "high",
    patterns: ["/api/marketing/audiences/pixel"],
  },
  {
    id: "meta-pixel",
    label: "Advertising pixel",
    kind: "advertising",
    level: "high",
    patterns: ["connect.facebook.net", "facebook.com/tr", "fbq("],
  },
  {
    id: "gtm",
    label: "Tag manager",
    kind: "advertising",
    level: "high",
    patterns: ["googletagmanager.com/gtm.js", "GTM-"],
  },
];

export type TagMark = "low" | "medium" | "high";

export function tagAllowed(choice: ChoiceLevel | null, need: TagMark) {
  if (need === "low") return choice === "low" || choice === "medium" || choice === "high";
  return levelMeets(choice, need);
}

/** Tags that may be inserted for this choice. Null is the state before any choice. */
export function tagsToRelease(tags: TrackingTag[], choice: ChoiceLevel | null) {
  return tags.filter((tag) => tagAllowed(choice, tag.level));
}

export function tagPatterns() {
  return OUR_TRACKING_TAGS.flatMap((tag) => tag.patterns.map((pattern) => ({ p: pattern, n: tag.level })));
}

/** True when this URL is one of our tags and the choice allows it. Unrelated URLs are left alone. */
export function scriptWouldLoad(src: string, choice: ChoiceLevel | null, marked?: TagMark | null) {
  if (marked === "low" || marked === "medium" || marked === "high") return tagAllowed(choice, marked);
  const tag = OUR_TRACKING_TAGS.find((item) => item.patterns.some((pattern) => src.includes(pattern)));
  if (!tag) return true;
  return tagAllowed(choice, tag.level);
}

export function detectConsentSnippet(html: string, clientKey?: string) {
  if (!html.includes("/api/public/consent/script")) return false;
  if (!clientKey) return true;
  return html.includes(`client=${clientKey}`) || html.includes(`client=${encodeURIComponent(clientKey)}`);
}
