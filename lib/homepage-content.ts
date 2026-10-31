import { BRAND_TAGLINE, BRAND_WORDMARK } from "./brand";
import { brandTokens } from "./brand/tokens";
import { BOOK_DEMO_LABEL, TRY_DEMO_FIRST_LABEL, TRY_DEMO_LABEL } from "./homepage-cta";
import { homepageDirection } from "./homepage-style";
import { canonicalOrigin } from "./hosts";
import { demoWorkspaceEnabled, postLoginPath, type Env } from "./public-routing";

/**
 * TODO(jason): Privacy wording, pricing, and reply-time promises need Jason's sign-off before they can be added.
 * Do not render this string. It is the reminder, not homepage copy.
 */
export const HOMEPAGE_SIGNOFF_TODO =
  "TODO(jason): Privacy wording, pricing, and reply-time promises need Jason's sign-off before they can be added.";

export const ILLUSTRATIVE_LABEL = "ILLUSTRATIVE";
export const EXAMPLE_LABEL = "EXAMPLE";
export const JASON_FACTS = "[JASON FACTS]";

export const HOMEPAGE_SECTION_ORDER = [
  "header",
  "hero",
  "pillars",
  "story",
  "proof",
  "how-it-works",
  "cta-1",
  "demo",
  "platform",
  "modules",
  "compare",
  "quiz",
  "faq",
  "cta-2",
  "contact",
  "footer",
] as const;

const LOGIN_LINKS = [
  { href: "/login", label: "Client login", cta: "client-login" },
  { href: "/login?audience=team", label: "Team login", cta: "team-login" },
] as const;

export type DemoSegment = {
  id: string;
  name: string;
  status: string;
  bar: number;
  channel: string;
  headline: string;
  body: string;
  note: string;
};

export type FeedItem = { title: string; body: string };

export type HomepageModel = {
  direction: "A" | "B";
  product: "Jarvis";
  byline: string;
  wordmark: string;
  tagline: string;
  brandColor: string;
  fonts: { sans: string; mono: string };
  logos: { reversed: string; alt: string };
  signedIn: boolean;
  appHref: string;
  showTryDemo: boolean;
  demoHref: "/demo";
  bookHref: "#contact";
  bookLabel: string;
  tryLabel: string;
  tryFirstLabel: string;
  logins: typeof LOGIN_LINKS;
  nav: { href: string; label: string }[];
  menuNav: { href: string; label: string }[];
  illustrative: typeof ILLUSTRATIVE_LABEL;
  example: typeof EXAMPLE_LABEL;
  jasonFacts: typeof JASON_FACTS;
  hero: { title: string; before: string; emphasis: string; after: string; legend: string[] };
  pillars: { title: string; body: string }[];
  story: {
    title: string;
    lead: string;
    beats: { label: string; title: string; body: string }[];
    photo: string;
  };
  proof: {
    title: string;
    lead: string;
    methodTitle: string;
    methodBody: string;
    method: { label: string; body: string }[];
    tourTitle: string;
    tourBody: string;
    logos: string[];
    slots: { kicker: string; title: string; note: string }[];
    quotes: { kicker: string; body: string; note: string }[];
    quotePhoto: string;
    teamNote: string;
  };
  steps: { kicker: string; title: string; body: string; lines: { text: string; strike?: boolean; accent?: boolean }[] }[];
  stepsNote: string;
  bands: { id: "cta-1" | "cta-2"; title: string; body: string }[];
  demo: { kicker: string; title: string; lead: string; group: string; barNote: string; feedNote: string };
  segments: DemoSegment[];
  feed: FeedItem[];
  platform: { quote: string; accent: string; points: string[]; photos: string; note: string };
  slip: { title: string; body: string; why: string };
  modulesTitle: string;
  modules: { title: string; body: string; meta: string }[];
  compare: { title: string; lead: string; columns: string[]; rows: { label: string; cells: string[] }[] };
  quiz: { title: string; lead: string; resultKicker: string; resultTitle: string };
  questions: { name: "q1" | "q2" | "q3" | "q4"; legend: string; options: { value: string; label: string }[] }[];
  faqTitle: string;
  faq: { question: string; answer: string }[];
  contact: { title: string; body: string; saved: string; invalid: string; running: string };
  footer: { blurb: string; product: string; account: string; legal: string };
  year: number;
};

const SEGMENTS: DemoSegment[] = [
  {
    id: "c",
    name: "Segment C",
    status: "LEADING",
    bar: 78,
    channel: "TikTok",
    headline: "Segment C: keep it running, and consider giving it more room",
    body: "People in this segment are watching your videos longer and booking more often than the others this week. Jarvis suggests moving some of your TikTok budget here.",
    note: "Budget change: recommended to your team, not made.",
  },
  {
    id: "a",
    name: "Segment A",
    status: "LEARNING",
    bar: 52,
    channel: "Meta",
    headline: "Segment A: still learning, give it a few more days",
    body: "Not enough people have seen these ads yet to call it. Jarvis will keep testing and tell you when it knows.",
    note: "No change needed.",
  },
  {
    id: "b",
    name: "Segment B",
    status: "SLOWING",
    bar: 30,
    channel: "TikTok",
    headline: "Segment B: consider pausing it",
    body: "Cost per lead has been rising for 3 days and fewer people are clicking through. Jarvis suggests pausing it and trying a new creative.",
    note: "Pause: recommended to your team, not changed.",
  },
];

const FEED: FeedItem[] = [
  { title: "Suggested pausing segment B on TikTok", body: "Cost per lead rose for 3 days. Recommended to your team, not changed." },
  { title: "New creative ready for segment A", body: "The current ad is getting skipped. Your team can approve the swap." },
  { title: "Retarget pricing-page visitors on Google", body: "They looked at pricing and left. Suggested, waiting for you." },
  { title: "Budget shift suggested: Meta to TikTok", body: "Segment C is doing better on TikTok. Recommended, budget unchanged until you approve." },
  { title: "Removed duplicate IDs from a new list", body: "Same people showed up twice. Cleaned before anything was served." },
  { title: "Suggested evening delivery for segment C", body: "That is when these people engage most. Waiting for your OK." },
];

export function homepageModel(env: Env = process.env, session: { signedIn: boolean; role?: string | null } = { signedIn: false }): HomepageModel {
  const showTryDemo = demoWorkspaceEnabled(env);
  const wordmark = BRAND_WORDMARK;
  const tagline = BRAND_TAGLINE;
  return {
    direction: homepageDirection(env),
    product: "Jarvis",
    byline: `by ${wordmark}`,
    wordmark,
    tagline,
    brandColor: brandTokens.light.brand,
    fonts: { sans: brandTokens.font.stack, mono: brandTokens.font.monoStack },
    logos: { reversed: brandTokens.logo.reversed, alt: brandTokens.logo.alt },
    signedIn: session.signedIn,
    appHref: session.signedIn ? postLoginPath(session.role, env) : "/app",
    showTryDemo,
    demoHref: "/demo",
    bookHref: "#contact",
    bookLabel: BOOK_DEMO_LABEL,
    tryLabel: TRY_DEMO_LABEL,
    tryFirstLabel: TRY_DEMO_FIRST_LABEL,
    logins: LOGIN_LINKS,
    nav: [
      { href: "#story", label: "Your story" },
      { href: "#demo", label: "See it work" },
      { href: "#how-it-works", label: "How it works" },
      { href: "#faq", label: "FAQ" },
    ],
    menuNav: [
      { href: "#story", label: "Your story" },
      { href: "#proof", label: "Proof" },
      { href: "#how-it-works", label: "How it works" },
      { href: "#demo", label: "See it work" },
      { href: "#quiz", label: "Budget check" },
      { href: "#faq", label: "FAQ" },
    ],
    illustrative: ILLUSTRATIVE_LABEL,
    example: EXAMPLE_LABEL,
    jasonFacts: JASON_FACTS,
    hero: {
      title: "Stop renting the platform's guess. Own the audience",
      before: "Jarvis builds your audience from ",
      emphasis: "verified real people in the data market",
      after: ", not from Meta's or Google's targeting. Then it tests every segment and optimizes every metric on every channel.",
      legend: ["Anonymous IDs", "Verified humans", "Winning segment"],
    },
    pillars: [
      { title: "Identify", body: "Build the audience from verified people in the data market, before a dollar is spent." },
      { title: "Engage", body: "Reach those same people on every channel, and let the segments compete." },
      { title: "Convert", body: "Jarvis explains every change in plain English. A person still sets the budget." },
    ],
    story: {
      title: "You've been paying for the platform's guess.",
      lead: "If you run a business, you've probably felt this. You know who your customers are. The ad platform doesn't, and you pay while it figures it out.",
      beats: [
        {
          label: "Before",
          title: "Clicks that never become customers",
          body: "You watch the spend go out. Some of the clicks are bots. The rest are whoever the platform decided looked close enough. And nobody can tell you why.",
        },
        {
          label: "The turn",
          title: "Start with real people instead",
          body: "Jarvis builds your audience in the data market first, checks that every ID is a real human, and only then serves your ads. You can see where every person came from.",
        },
        {
          label: "After",
          title: "Spend you can explain",
          body: "Your ads reach people who are actually in your market. Every change comes with a reason in plain English, and you still decide where the money goes.",
        },
      ],
      photo: `Photo: ${JASON_FACTS} client owner at their shop, with permission. Placeholder, not a real person.`,
    },
    proof: {
      title: "You should see the method before the results.",
      lead: "We won't quote numbers we can't back up. Here is exactly how it works, and real results go here as clients approve them.",
      methodTitle: "Every audience has a paper trail.",
      methodBody: "You can see where each list came from and why it is running.",
      method: [
        { label: "Source", body: "Which data market vendor supplied the mobile ad IDs" },
        { label: "Verify", body: "Bots and duplicates removed before anything is served" },
        { label: "Test", body: "Segments compared against each other, not against a guess" },
        { label: "Decide", body: "Jarvis recommends, your team approves" },
      ],
      tourTitle: "Walk through Jarvis with sample data.",
      tourBody: "See the command center, the audience library, a segment test, reports, and the decisions inbox. No login needed.",
      logos: [`TODO(jason) ${JASON_FACTS} Logo`, `TODO(jason) ${JASON_FACTS} Logo`, `TODO(jason) ${JASON_FACTS} Logo`, `TODO(jason) ${JASON_FACTS} Logo`],
      slots: [
        { kicker: "CASE STUDY", title: "TODO(jason) Case study coming", note: `${JASON_FACTS} Published with client approval` },
        { kicker: "WHITE PAPER", title: "TODO(jason) White paper coming", note: `${JASON_FACTS} Data market audiences vs platform targeting` },
      ],
      quotes: [
        { kicker: `TESTIMONIAL ${JASON_FACTS}`, body: "TODO(jason) A real client quote goes here once they say yes.", note: "Name, role, company. Approved in writing." },
        { kicker: `TESTIMONIAL ${JASON_FACTS}`, body: "TODO(jason) Second client voice.", note: "Placeholder" },
      ],
      quotePhoto: `Photo: ${JASON_FACTS} the client who gave the quote`,
      teamNote: "The people who review your account. Real photos only, with permission.",
    },
    steps: [
      {
        kicker: "Data market audiences",
        title: "Buy the right people",
        body: "We source mobile ad IDs from the data market, matched to who you actually sell to.",
        lines: [{ text: "a91f-22c0" }, { text: "7be3-910d" }, { text: "c04a-5e17" }, { text: "..." }],
      },
      {
        kicker: "Verified humans",
        title: "Keep only real ones",
        body: "Bots, duplicates and stale IDs are filtered out before a dollar is spent.",
        lines: [
          { text: "a91f-22c0  human" },
          { text: "7be3-910d  bot", strike: true },
          { text: "c04a-5e17  human" },
        ],
      },
      {
        kicker: "Segment tests",
        title: "Let segments compete",
        body: "Pixels serve the same people across Meta, Google, TikTok and programmatic, and segments are tested head to head.",
        lines: [{ text: "segment A  learning" }, { text: "segment B  learning" }, { text: "segment C  leading", accent: true }],
      },
      {
        kicker: "Jarvis optimization",
        title: "Improve every metric",
        body: "Jarvis tunes creative, timing and placement, and tells you why in plain English.",
        lines: [{ text: "scale C" }, { text: "rest A" }, { text: "budget: ask a person", accent: true }],
      },
    ],
    stepsNote: "Examples above are illustrative.",
    bands: [
      { id: "cta-1", title: "Want to see your own market through Jarvis?", body: "Bring a campaign you are already running. We will walk the audience, the test, and the decision." },
      {
        id: "cta-2",
        title: `${BOOK_DEMO_LABEL}.`,
        body: "Tell us what you're running today. We'll show you what Jarvis would do with it, on a call, with no pressure.",
      },
    ],
    demo: {
      kicker: "Command center",
      title: "See it work. Tap a segment.",
      lead: "This is the kind of thing you'd see every morning. The audience library, segment tests, reports, and the decisions inbox live here. Pick a segment and Jarvis tells you what it thinks, and why.",
      group: "SEGMENTS: HOMEOWNERS, GULF COAST",
      barNote: "Bars are illustrative, not measurements.",
      feedNote: "Jarvis never changes a budget. It asks you.",
    },
    segments: SEGMENTS,
    feed: FEED,
    platform: {
      quote: "Your team sets every budget.",
      accent: "Jarvis never touches it.",
      points: [
        "Audiences are built in the data market from mobile ad ID lists you can trace.",
        "Bots and duplicates are filtered out, so spend goes to verified humans.",
        "Every suggestion comes with its reason, in plain English.",
        "Your team owns every budget. A person approves or declines, and the decision is logged with who made it.",
        "Meta, Google, TikTok, and programmatic sit in one view.",
      ],
      photos: `Photo: ${JASON_FACTS} team member`,
      note: "The people who review your account. Real photos only, with permission.",
    },
    slip: {
      title: "Shift part of the Meta budget to segment C on TikTok",
      body: "Jarvis will not make this change on its own.",
      why: "Why: segment C is engaging more often on TikTok this week and costs less to reach there.",
    },
    modulesTitle: "Inside Jarvis",
    modules: [
      { title: "Audiences", body: "Data market sourcing, verification and segment tests.", meta: "core" },
      { title: "Pixels and retargeting", body: "The same people, followed across every platform.", meta: "core" },
      { title: "Optimization", body: "Every metric on every channel, explained.", meta: "core" },
      { title: "Landing pages and reports", body: "Pages per audience and reports a client can read in a minute.", meta: "module" },
      { title: "AIS2L voice", body: "An AI voice agent that answers and follows up with leads.", meta: "add-on" },
    ],
    compare: {
      title: "Jarvis vs a typical agency vs DIY ad platforms.",
      lead: "A qualitative look. No scores, no prices, and no results we have not published.",
      columns: ["Jarvis", "A typical agency", "DIY ad platforms"],
      rows: [
        {
          label: "Audience",
          cells: [
            "Built in the data market from mobile ad ID lists you can trace.",
            "Often starts from the platform's targeting, then a monthly report.",
            "You rent the platform's guess inside one ad account.",
          ],
        },
        {
          label: "Verification",
          cells: [
            "Bots and duplicates are removed before anything is served.",
            "You may not see the check.",
            "The platform decides what counts as a person.",
          ],
        },
        {
          label: "Recommendations",
          cells: [
            "Plain English, and a person approves any budget change.",
            "A strategist, on their schedule.",
            "Dashboards you interpret yourself.",
          ],
        },
        {
          label: "Budget",
          cells: [
            "Your team sets every budget. Jarvis never moves it.",
            "The agency often moves spend for you.",
            "You move it, without a shared paper trail.",
          ],
        },
        {
          label: "Channels",
          cells: [
            "Meta, Google, TikTok, and programmatic in one view.",
            "Depends on the retainer.",
            "One platform at a time.",
          ],
        },
      ],
    },
    quiz: {
      title: "Where is your ad budget leaking?",
      lead: "Four quick questions. No email needed. You'll get a plain-English read on where to look first.",
      resultKicker: "YOUR READ (QUALITATIVE, NOT A SCORE)",
      resultTitle: "Here is where we would look first",
    },
    questions: [
      {
        name: "q1",
        legend: "Who picks your audience today?",
        options: [
          { value: "p", label: "The ad platform" },
          { value: "a", label: "Our agency" },
          { value: "u", label: "We build our own lists" },
        ],
      },
      {
        name: "q2",
        legend: "Can you tell how many of your clicks are bots?",
        options: [
          { value: "n", label: "No idea" },
          { value: "s", label: "Roughly" },
          { value: "y", label: "Yes, we check" },
        ],
      },
      {
        name: "q3",
        legend: "When results change, do you know why?",
        options: [
          { value: "n", label: "Rarely" },
          { value: "s", label: "Sometimes" },
          { value: "y", label: "Usually" },
        ],
      },
      {
        name: "q4",
        legend: "Do you retarget the same people across channels?",
        options: [
          { value: "n", label: "No" },
          { value: "s", label: "On one channel" },
          { value: "y", label: "Everywhere" },
        ],
      },
    ],
    faqTitle: "The questions you're probably asking",
    faq: [
      {
        question: "How is this different from platform targeting?",
        answer:
          "Platform targeting asks Meta or Google to guess who your buyer is, inside their walls. Jarvis builds the audience first from the data market, verifies the people are real, then uses pixels to reach that same audience on every platform. You own the list and can see where it came from.",
      },
      {
        question: "Is this private and compliant?",
        answer: "TODO(jason): Privacy wording needs Jason's sign-off. This is not a policy.",
      },
      {
        question: "Who controls the budget?",
        answer:
          "You do. People set every budget. Jarvis can recommend a budget change with its reasoning, and a person on your team approves or declines it. Jarvis never changes a budget on its own.",
      },
      {
        question: "What will I see as a client?",
        answer: "A client view of your audiences, channels and results, plain-English recommendations, and reports you can share. The demo tour shows it with sample data.",
      },
      {
        question: "How soon will I see results?",
        answer: "It depends on your market, channels and how much testing your audiences need. We will set expectations for your situation on a demo call.",
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
      title: `${BOOK_DEMO_LABEL}.`,
      body: "Tell us what you're running today. We'll show you what Jarvis would do with it, on a call, with no pressure.",
      saved: "Saved on this server. Nothing was sent.",
      invalid: "Enter your name, email, and a message.",
      running: "What are you running today?",
    },
    footer: {
      blurb: `Jarvis by ${wordmark}. Audiences built from the data market.`,
      product: "Product",
      account: "Account",
      legal: "Legal",
    },
    year: 2026,
  };
}

export function homepageProse(model: HomepageModel) {
  return [
    model.hero.title,
    model.hero.before,
    model.hero.emphasis,
    model.hero.after,
    model.tagline,
    ...model.pillars.flatMap((item) => [item.title, item.body]),
    model.story.title,
    model.story.lead,
    ...model.story.beats.flatMap((beat) => [beat.label, beat.title, beat.body]),
    model.story.photo,
    model.proof.title,
    model.proof.lead,
    model.proof.methodTitle,
    model.proof.methodBody,
    ...model.proof.method.flatMap((row) => [row.label, row.body]),
    model.proof.tourTitle,
    model.proof.tourBody,
    ...model.proof.logos,
    ...model.proof.slots.flatMap((slot) => [slot.kicker, slot.title, slot.note]),
    ...model.proof.quotes.flatMap((quote) => [quote.kicker, quote.body, quote.note]),
    model.proof.quotePhoto,
    ...model.steps.flatMap((step) => [step.kicker, step.title, step.body, ...step.lines.map((line) => line.text)]),
    model.stepsNote,
    ...model.bands.flatMap((band) => [band.title, band.body]),
    model.demo.kicker,
    model.demo.title,
    model.demo.lead,
    model.demo.barNote,
    model.demo.feedNote,
    ...model.segments.flatMap((segment) => [segment.name, segment.status, segment.channel, segment.headline, segment.body, segment.note]),
    ...model.feed.flatMap((item) => [item.title, item.body]),
    model.platform.quote,
    model.platform.accent,
    ...model.platform.points,
    model.platform.note,
    model.slip.title,
    model.slip.body,
    model.slip.why,
    model.modulesTitle,
    ...model.modules.flatMap((row) => [row.title, row.body, row.meta]),
    model.compare.title,
    model.compare.lead,
    ...model.compare.columns,
    ...model.compare.rows.flatMap((row) => [row.label, ...row.cells]),
    model.quiz.title,
    model.quiz.lead,
    model.quiz.resultKicker,
    model.quiz.resultTitle,
    ...model.questions.flatMap((question) => [question.legend, ...question.options.map((option) => option.label)]),
    model.faqTitle,
    ...model.faq.flatMap((item) => [item.question, item.answer]),
    model.contact.title,
    model.contact.body,
    model.contact.saved,
    model.contact.invalid,
    model.footer.blurb,
    model.product,
    model.byline,
    model.illustrative,
    model.example,
  ].join("\n");
}

export function homepageDescription() {
  return "Jarvis builds your audience from verified real people in the data market, not from the ad platform's guess. Then it tests every segment and explains every change in plain English.";
}

export function homepageJsonLd(origin: string | null) {
  const url = origin ? `${origin}/` : "/";
  const logo = origin ? `${origin}${brandTokens.logo.reversed}` : brandTokens.logo.reversed;
  const description = homepageDescription();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: BRAND_WORDMARK,
        url,
        logo,
        slogan: BRAND_TAGLINE,
      },
      {
        "@type": "SoftwareApplication",
        name: "Jarvis",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url,
        description,
        publisher: { "@type": "Organization", name: BRAND_WORDMARK },
      },
    ],
  };
}

export function homepageMetadata(origin: string | null) {
  const title = `Jarvis by ${BRAND_WORDMARK} | ${BRAND_TAGLINE}`;
  const description = homepageDescription();
  const image = origin ? `${origin}/brand/jarvis-og.png` : "/brand/jarvis-og.png";
  return {
    title: { absolute: title },
    description,
    alternates: origin ? { canonical: `${origin}/` } : undefined,
    openGraph: {
      title,
      description,
      type: "website" as const,
      siteName: "Jarvis",
      url: origin ? `${origin}/` : undefined,
      images: [{ url: image, width: 1200, height: 630, alt: `${BRAND_WORDMARK}. ${BRAND_TAGLINE}` }],
    },
    twitter: { card: "summary_large_image" as const, title, description, images: [image] },
    robots: { index: true, follow: true },
  };
}

export function metadataOrigin(hostHeader: string | null, env: Env) {
  return canonicalOrigin(hostHeader, env);
}
