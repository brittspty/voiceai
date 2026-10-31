import { brandTokens } from "./brand/tokens";
import { BOOK_DEMO_LABEL, TRY_DEMO_LABEL } from "./homepage-cta";
import { canonicalOrigin } from "./hosts";
import { homepageDirection } from "./homepage-style";
import { demoWorkspaceEnabled, postLoginPath, type Env } from "./public-routing";

/**
 * TODO(jason): Privacy wording, pricing, and reply-time promises need Jason's sign-off before they can be added.
 * Do not render this string. It is the reminder, not homepage copy.
 */
export const HOMEPAGE_SIGNOFF_TODO =
  "TODO(jason): Privacy wording, pricing, and reply-time promises need Jason's sign-off before they can be added.";

export const HOMEPAGE_SECTION_ORDER = ["header", "hero", "how-it-works", "cta-1", "cta-2", "proof", "faq", "contact", "footer"] as const;

const LOGIN_LINKS = [
  { href: "/login" as const, label: "Client login" as const },
  { href: "/login" as const, label: "Team login" as const },
];

export type HomepageModel = {
  direction: "A" | "B";
  placeholder: "PLACEHOLDER";
  product: "Jarvis";
  byline: "by Specificity";
  brandColor: string;
  ink: string;
  canvas: string;
  onInk: string;
  fonts: { sans: string; mono: string };
  logos: { full: string; reversed: string; mark: string; alt: string };
  signedIn: boolean;
  appHref: string;
  showTryDemo: boolean;
  demoHref: "/demo";
  bookHref: "#contact";
  bookLabel: string;
  tryLabel: string;
  logins: typeof LOGIN_LINKS;
  hero: { kicker: string; title: string; body: string };
  feed: string[];
  steps: { title: string; body: string }[];
  bands: { id: "cta-1" | "cta-2"; title: string; body: string; tone: "primary" | "alt" }[];
  proof: { title: string; body: string; cards: { title: string; body: string }[] };
  faq: { question: string; answer: string }[];
  contact: { title: string; body: string; saved: string; invalid: string };
};

export function homepageModel(env: Env = process.env, session: { signedIn: boolean; role?: string | null } = { signedIn: false }): HomepageModel {
  const showTryDemo = demoWorkspaceEnabled(env);
  return {
    direction: homepageDirection(env),
    placeholder: "PLACEHOLDER",
    product: "Jarvis",
    byline: "by Specificity",
    brandColor: brandTokens.light.brand,
    ink: brandTokens.light.ink,
    canvas: brandTokens.light.canvas,
    onInk: brandTokens.light.onInk,
    fonts: { sans: brandTokens.font.stack, mono: brandTokens.font.monoStack },
    logos: {
      full: brandTokens.logo.full,
      reversed: brandTokens.logo.reversed,
      mark: brandTokens.logo.src,
      alt: brandTokens.logo.alt,
    },
    signedIn: session.signedIn,
    appHref: session.signedIn ? postLoginPath(session.role, env) : "/app",
    showTryDemo,
    demoHref: "/demo",
    bookHref: "#contact",
    bookLabel: BOOK_DEMO_LABEL,
    tryLabel: TRY_DEMO_LABEL,
    logins: LOGIN_LINKS,
    hero: {
      kicker: "PLACEHOLDER",
      title: "PLACEHOLDER. Jarvis calls new leads while your team keeps working.",
      body: "PLACEHOLDER. The call follows your rules, and the conversation is written back to the client record.",
    },
    feed: [
      "PLACEHOLDER. A new lead is waiting for a call.",
      "PLACEHOLDER. Jarvis is introducing the company.",
      "PLACEHOLDER. The call followed the rules on file.",
      "PLACEHOLDER. The conversation was logged to the client record.",
    ],
    steps: [
      { title: "A lead comes in", body: "PLACEHOLDER. Someone asks for a conversation." },
      { title: "Jarvis places the call", body: "PLACEHOLDER. The voice agent speaks for your company." },
      { title: "Rules are checked first", body: "PLACEHOLDER. Consent, calling hours, and the do-not-call list are part of the call." },
      { title: "The conversation is logged", body: "PLACEHOLDER. Notes land in the client record." },
    ],
    bands: [
      {
        id: "cta-1",
        tone: "primary",
        title: "PLACEHOLDER. See Jarvis on a lead you already have.",
        body: `PLACEHOLDER. ${BOOK_DEMO_LABEL} and we will keep the note on this server.`,
      },
      {
        id: "cta-2",
        tone: "alt",
        title: "PLACEHOLDER. Walk the workflow before you commit.",
        body: `PLACEHOLDER. ${BOOK_DEMO_LABEL} when you want a walkthrough.`,
      },
    ],
    proof: {
      title: "PLACEHOLDER. Proof",
      body: "PLACEHOLDER. Real stories will go here. This draft states no rates, counts, or outcomes.",
      cards: [
        { title: "PLACEHOLDER. Customer story", body: "PLACEHOLDER. Empty until a real story is approved." },
        { title: "PLACEHOLDER. Outcome", body: "PLACEHOLDER. Empty until a real outcome is approved." },
        { title: "PLACEHOLDER. Quote", body: "PLACEHOLDER. Empty until a real quote is approved." },
      ],
    },
    faq: [
      {
        question: "Who uses Client login?",
        answer: "PLACEHOLDER. People with a client account. It opens the same sign-in page as the team.",
      },
      {
        question: "Who uses Team login?",
        answer: "PLACEHOLDER. Super admins and account managers use the same sign-in page. The account decides which view opens.",
      },
      {
        question: `What does ${BOOK_DEMO_LABEL} do?`,
        answer: "PLACEHOLDER. The form on this page stores your note. It does not send email.",
      },
      {
        question: "Is the feed live?",
        answer: "PLACEHOLDER. It is sample text. It is not a live activity stream.",
      },
      {
        question: "How is personal information handled?",
        answer: "TODO(jason): Privacy wording needs Jason's sign-off. This is not a policy.",
      },
      {
        question: "What does it cost?",
        answer: "TODO(jason): Pricing needs Jason's sign-off. No price is stated here.",
      },
      {
        question: "When will someone reply?",
        answer: "TODO(jason): Reply-time promises need Jason's sign-off. No reply time is stated here.",
      },
    ],
    contact: {
      title: `PLACEHOLDER. ${BOOK_DEMO_LABEL}`,
      body: "PLACEHOLDER. Your note is stored here. It is not emailed.",
      saved: "PLACEHOLDER. Saved on this server. Nothing was sent.",
      invalid: "Enter your name, email, and a message.",
    },
  };
}

export function homepageProse(model: HomepageModel) {
  return [
    model.hero.kicker,
    model.hero.title,
    model.hero.body,
    ...model.feed,
    ...model.steps.flatMap((step) => [step.title, step.body]),
    ...model.bands.flatMap((band) => [band.title, band.body]),
    model.proof.title,
    model.proof.body,
    ...model.proof.cards.flatMap((card) => [card.title, card.body]),
    ...model.faq.flatMap((item) => [item.question, item.answer]),
    model.contact.title,
    model.contact.body,
    model.contact.saved,
    model.contact.invalid,
    model.product,
    model.byline,
  ].join("\n");
}

export function homepageMetadata(origin: string | null) {
  const title = "Jarvis by Specificity";
  const description = "PLACEHOLDER. Jarvis calls new leads, follows your rules, and logs the conversation. Final copy is not in yet.";
  const image = origin ? `${origin}${brandTokens.logo.full}` : brandTokens.logo.full;
  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      type: "website" as const,
      siteName: "Jarvis",
      url: origin ? `${origin}/` : undefined,
      images: [{ url: image, alt: brandTokens.logo.alt }],
    },
    twitter: { card: "summary_large_image" as const, title, description },
    robots: { index: true, follow: true },
  };
}

export function metadataOrigin(hostHeader: string | null, env: Env) {
  return canonicalOrigin(hostHeader, env);
}
