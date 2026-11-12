import { publicLogoSize } from "@/lib/brand/public";
import { TrackedLink } from "@/components/homepage-cta-link";
import { ContactForm } from "@/components/homepage-contact-form";
import { WaitlistForm } from "@/components/homepage-waitlist-form";
import { HomepageDemo } from "@/components/homepage-demo";
import { HomepageFeed } from "@/components/homepage-feed";
import { HomepageFlow } from "@/components/homepage-flow";
import { BudgetGraphic, ConversionGraphic, TrailGraphic } from "@/components/homepage-graphics";
import { HomepageMenu } from "@/components/homepage-header";
import { FaqMark, IconPlate, NetCluster, NetRule } from "@/components/homepage-icons";
import { HOMEPAGE_MOTION_SCRIPT } from "@/components/homepage-motion";
import { HomepageQuiz } from "@/components/homepage-quiz";
import { HOMEPAGE_REVEAL_SCRIPT, HomepageReveal } from "@/components/homepage-reveal";
import { RecommendationSlip } from "@/components/homepage-slip";
import type { MarkName } from "@/components/homepage-marks";
import { EXEC_SUMMARY_BAND, EXEC_SUMMARY_HREF, EXEC_SUMMARY_NAV, HOMEPAGE_SECTION_ORDER, homepageJsonLd, type HomepageModel } from "@/lib/homepage-content";
import { homepageStyle } from "@/lib/homepage-style";

const PILLAR_ICONS: MarkName[] = ["identify", "engage", "convert"];
const COMPARE_ICONS: MarkName[] = ["audience", "conversions", "recommendations", "control", "channels", "honesty"];
const MODULE_ICONS: Record<string, MarkName> = {
  Audiences: "audience",
  "Pixels and retargeting": "pixels",
  Optimization: "optimization",
  "Landing pages and reports": "reports",
  "AIS2L voice": "voice",
};

const HERO_SRCSET = "/homepage/hero-network-1440.webp 1440w, /homepage/hero-network-2560.webp 2560w";
const STORY_SRCSET = "/homepage/story-photo-1440.webp 1440w, /homepage/story-photo-2560.webp 2560w";

const MOTION_BOOT = "document.documentElement.classList.add('js');if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('reduce-motion');";

const NOSCRIPT_FINAL = `.home .hero-diag .list-card,.home .hero-diag .list-bar,.home .hero-diag .ch-line,.home .hero-diag .ch-pill,.home .hero-diag .ch-ico-pop{opacity:1 !important;transform:none !important;animation:none !important;stroke-dashoffset:0 !important;stroke-dasharray:none !important}.home .ui-flow .ui-row,.home .ui-flow .ui-chip,.home .ui-flow .ui-tally{opacity:1 !important;transform:none !important}`;

function indexLabel(index: number) {
  return String(index + 1).padStart(2, "0");
}

function Wordmark({ model, place }: { model: HomepageModel; place: "header" | "footer" }) {
  const footer = place === "footer";
  const size = publicLogoSize(footer ? "lockup" : "wordmark", footer ? 187 : 44);
  return <img src={footer ? model.logos.lockup : model.logos.wordmark} alt={footer ? model.logos.alt : ""} width={size.width} height={size.height} className={footer ? "lockup" : "wordmark"} />;
}

function LoginLinks({ model }: { model: HomepageModel }) {
  return (
    <>
      {model.signedIn ? (
        <TrackedLink href={model.appHref} cta="go-app" className="go-app">
          Go to app
        </TrackedLink>
      ) : null}
      <TrackedLink href={model.logins[0].href} cta={model.logins[0].cta} className="client-login">
        {model.logins[0].label}
      </TrackedLink>
      <TrackedLink href={model.logins[1].href} cta={model.logins[1].cta} className="team-login">
        {model.logins[1].label}
      </TrackedLink>
    </>
  );
}

function TryLink({ model, className, cta, first = false }: { model: HomepageModel; className: string; cta: string; first?: boolean }) {
  if (!model.showTryDemo) return null;
  return (
    <TrackedLink href={model.demoHref} cta={cta} className={className}>
      {first ? model.tryFirstLabel : model.tryLabel}
    </TrackedLink>
  );
}

function ArtLine({ text, strike, accent }: { text: string; strike?: boolean; accent?: boolean }) {
  if (strike) return <s>{text}</s>;
  if (!accent) return <>{text}</>;
  const marker = text.includes("leading") ? "leading" : "ask";
  const at = text.indexOf(marker);
  if (at < 0) return <span className="o">{text}</span>;
  return (
    <>
      {text.slice(0, at)}
      <span className="o">{text.slice(at)}</span>
    </>
  );
}

export function PublicHomepage({
  model,
  notice = null,
  waitlist = null,
}: {
  model: HomepageModel;
  notice?: "saved" | "invalid" | null;
  waitlist?: "saved" | "invalid" | "limited" | null;
}) {
  const style = homepageStyle(model.direction);
  const jsonLd = JSON.stringify(homepageJsonLd()).replace(/</g, "\\u003c");
  const band = model.bands[0];
  const finale = model.bands[1];
  const heroMark = publicLogoSize("wordmark", 112);

  return (
    <div className={`home ${style.hero}`} data-direction={style.id} data-sections={HOMEPAGE_SECTION_ORDER.join(" ")} style={{ ["--brand" as string]: model.brandColor, fontFamily: model.fonts.sans }}>
      <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />
      <link rel="preload" as="image" href="/homepage/hero-network-2560.webp" imageSrcSet={HERO_SRCSET} imageSizes="100vw" />
      <a className="skip" href="#hero">
        Skip to content
      </a>
      <header id="header" className="site-header">
        <div className="w topbar">
          <a href="#hero" aria-label={model.logos.alt}>
            <Wordmark model={model} place="header" />
          </a>
          <nav className="desk-nav" aria-label="Main">
            {model.nav.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="desk-logins">
            <LoginLinks model={model} />
            <TrackedLink href={model.bookHref} cta="book-demo-header" className="btn">
              {model.bookLabel}
            </TrackedLink>
          </div>
          <TrackedLink href={model.bookHref} cta="book-demo-header-bar" className="btn header-cta">
            {model.bookLabel}
          </TrackedLink>
          <HomepageMenu>
            {model.menuNav.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
            <LoginLinks model={model} />
            <TrackedLink href={model.bookHref} cta="book-demo-menu" className="btn">
              {model.bookLabel}
            </TrackedLink>
          </HomepageMenu>
        </div>
      </header>

      <HomepageReveal>
        <main>
          <section className="hero" id="hero" aria-labelledby="h1">
            <div className="hero-bg" aria-hidden="true">
              <img src="/homepage/hero-network-2560.webp" srcSet={HERO_SRCSET} sizes="100vw" alt="" width={2560} height={1441} fetchPriority="high" />
              <div className="hero-grain" />
            </div>
            <div className="hero-scrim" aria-hidden="true" />
            <div className="w">
              <div className="hero-copy">
                <img src={model.logos.wordmark} alt={model.logos.alt} width={heroMark.width} height={heroMark.height} className="hero-mark" />
                <p className="hero-tag">{model.tagline}</p>
                <p className="hero-support">{model.supportLine}</p>
                <h1 id="h1">
                  {model.hero.title}
                  <em>.</em>
                </h1>
                <p className="sub">
                  {model.hero.before}
                  <b>{model.hero.emphasis}</b>
                  {model.hero.after}
                </p>
                <div className="hero-actions">
                  <div className="hero-cta">
                    <TrackedLink href={model.bookHref} cta="book-demo-hero" className="btn">
                      {model.bookLabel}
                    </TrackedLink>
                    <TryLink model={model} className="btn sec" cta="try-demo-hero" />
                  </div>
                  <TrackedLink href={model.agency.href} cta="agency-waitlist-hero" className="hero-agency">
                    {model.agency.navLabel}
                  </TrackedLink>
                </div>
              </div>
              <HomepageFlow />
            </div>
          </section>

          <section className="pillars rule-top" id="pillars" aria-labelledby="pillars-title">
            <NetRule />
            <h2 id="pillars-title" className="sr-only">
              {model.tagline}
            </h2>
            <div className="w pillars-grid">
              {model.pillars.map((pillar, index) => (
                <article className={index ? `pillar rv rv-d${index}` : "pillar rv"} key={pillar.title}>
                  <IconPlate name={PILLAR_ICONS[index] ?? "identify"} />
                  <span className="lab">{indexLabel(index)}</span>
                  <h3>{pillar.title}</h3>
                  <p>{pillar.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="story rule-top" id="story">
            <NetRule />
            <div className="w">
              <h2 className="story-intro rv">{model.story.title}</h2>
              <p className="lead rv">{model.story.lead}</p>
              <div className="beats">
                {model.story.beats.map((beat, index) => (
                  <article className={index ? `beat rv rv-d${index}` : "beat rv"} key={beat.label}>
                    <span className="lab">{beat.label}</span>
                    <h3>{beat.title}</h3>
                    <p>{beat.body}</p>
                  </article>
                ))}
              </div>
              {model.showExecSummaryBand ? (
                <aside className="exec-cta rv" id="executive-summary" aria-labelledby="exec-cta-title">
                  <div className="exec-cta-copy">
                    <p className="lab">{EXEC_SUMMARY_BAND.label}</p>
                    <h3 id="exec-cta-title">{EXEC_SUMMARY_BAND.title}</h3>
                    <p className="exec-cta-dek">{EXEC_SUMMARY_BAND.dek}</p>
                    <p className="exec-cta-note">{EXEC_SUMMARY_BAND.note}</p>
                    <p className="exec-cta-meta">{EXEC_SUMMARY_BAND.meta}</p>
                    <a className="btn" href={EXEC_SUMMARY_HREF}>
                      {EXEC_SUMMARY_BAND.button}
                    </a>
                  </div>
                  <div className="exec-cta-visual">
                    <figure className="exec-cta-photo">
                      <img
                        src="/homepage/story-photo-1440.webp"
                        srcSet={STORY_SRCSET}
                        sizes="(min-width: 1024px) 680px, calc(100vw - 40px)"
                        alt="Woman in a studio reviewing a tablet"
                        width={2560}
                        height={1440}
                      />
                    </figure>
                    <div className="exec-doc" aria-hidden="true">
                      <img src="/executive-summary/thumbs/page-01-card.webp" alt="" width={480} height={621} />
                    </div>
                  </div>
                </aside>
              ) : (
                <figure className="story-photo">
                  <img
                    src="/homepage/story-photo-1440.webp"
                    srcSet={STORY_SRCSET}
                    sizes="(min-width: 1024px) 1216px, calc(100vw - 40px)"
                    alt="Woman in a studio reviewing a tablet."
                    width={2560}
                    height={1440}
                  />
                </figure>
              )}
            </div>
          </section>

          <section className="proof" id="proof">
            <NetRule />
            <div className="w">
              {model.showLogos ? (
                <>
                  <div className="top rv">
                    <h2>{model.proof.title}</h2>
                    <p className="lead">{model.proof.lead}</p>
                  </div>
                  <div className="logo-row" aria-label="Client logos">
                    {model.proof.logos.map((logo, index) => (
                      <div className="logo-ph" key={`${logo}-${index}`}>
                        <span>LOGO</span>
                        <span>{logo}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              <div className="proof-grid">
                <div className="method rv">
                  <span className="lab">The method</span>
                  <h3>{model.proof.methodTitle}</h3>
                  <p className="lead">{model.proof.methodBody}</p>
                  <TrailGraphic />
                  <ol>
                    {model.proof.method.map((step) => (
                      <li key={step.label}>
                        <span className="k">{step.label}</span>
                        <span>{step.body}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                {model.showDemoTour ? (
                  <div className="tour rv rv-d1" id="tour">
                    <span className="lab">Demo tour</span>
                    <h3>{model.proof.tourTitle}</h3>
                    <p>{model.proof.tourBody}</p>
                    <TryLink model={model} className="btn sec" cta="try-demo-tour" />
                  </div>
                ) : null}
                {model.showProof ? (
                  <div className="slots">
                    {model.proof.slots.map((slot) => (
                      <div className="slot" key={slot.kicker}>
                        <span className="mono lab">{slot.kicker}</span>
                        <b>{slot.title}</b>
                        <span className="note">{slot.note}</span>
                      </div>
                    ))}
                    <div className="quote">
                      <span className="mono lab">{model.proof.quotes[0]?.kicker}</span>
                      <p>{model.proof.quotes[0]?.body}</p>
                      <p className="who">{model.proof.quotes[0]?.note}</p>
                    </div>
                    <figure className="slot-photo">
                      <figcaption>{model.proof.quotePhoto}</figcaption>
                    </figure>
                    <div className="quote quote-wide">
                      <span className="mono lab">{model.proof.quotes[1]?.kicker}</span>
                      <p>{model.proof.quotes[1]?.body}</p>
                      <p className="who">{model.proof.quotes[1]?.note}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="how rule-top" id="how-it-works">
            <NetRule />
            <NetCluster side="left" />
            <div className="w">
              <h2 className="rv">Here is what happens to your money.</h2>
              <BudgetGraphic />
              <div className="flow">
                {model.steps.map((step, index) => (
                  <article className={index % 2 ? "fs rv rv-d1" : "fs rv"} key={step.title}>
                    <span className="lab">{step.kicker}</span>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                    <div className="art mono">
                      {step.lines.map((line) => (
                        <div key={line.text}>
                          <ArtLine text={line.text} strike={line.strike} accent={line.accent} />
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <p className="note lab">{model.stepsNote}</p>
            </div>
          </section>

          <section className="band" id={band.id} aria-label={band.title}>
            <div className="w">
              <h2>{band.title}</h2>
              <div className="actions">
                <TrackedLink href={model.bookHref} cta="book-demo-band" className="btn">
                  {model.bookLabel}
                </TrackedLink>
                <TryLink model={model} className="btn sec" cta="try-demo-band" />
              </div>
            </div>
          </section>

          <section className="demo" id="demo">
            <div className="w">
              <p className="lab rv">{model.demo.kicker}</p>
              <h2 className="rv">{model.demo.title}</h2>
              <p className="lead rv">{model.demo.lead}</p>
              <div className="console">
                <HomepageDemo segments={model.segments} illustrative={model.illustrative} group={model.demo.group} barNote={model.demo.barNote} />
                <div className="feed-wrap rv rv-d1">
                  <div className="ph mono">
                    <span>
                      {model.product} decision feed
                    </span>
                    <span>{model.example}</span>
                  </div>
                  <HomepageFeed items={model.feed} example={model.example} />
                  <p className="mono lab">{model.demo.feedNote}</p>
                </div>
                <section id="platform" className="console-rest">
                  <div className="hum rv">
                    <blockquote>
                      {model.platform.quote} <span>{model.platform.accent}</span>
                    </blockquote>
                    <ul>
                      {model.platform.points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                    <div className="team-row">
                      {[0, 1, 2].map((index) => (
                        <figure className="team-ph" key={index}>
                          <div className="frame" aria-hidden="true" />
                          <figcaption>{model.platform.photos}</figcaption>
                        </figure>
                      ))}
                    </div>
                    <p className="team-note">{model.platform.note}</p>
                  </div>
                  <div className="slip-wrap rv rv-d1">
                    <RecommendationSlip illustrative={model.illustrative} title={model.slip.title} body={model.slip.body} why={model.slip.why} />
                  </div>
                </section>
              </div>
            </div>
          </section>

          <section className="mods" id="modules">
            <NetRule />
            <div className="w mods-grid">
              <h2>{model.modulesTitle}</h2>
              <div>
                {model.modules.map((row) => (
                  <article className="mr" key={row.title}>
                    {MODULE_ICONS[row.title] ? <IconPlate name={MODULE_ICONS[row.title]} size={40} /> : null}
                    <h3>{row.title}</h3>
                    <p>{row.body}</p>
                    <span className="mono">{row.meta}</span>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="cmp rule-top" id="compare">
            <NetRule />
            <NetCluster side="right" />
            <div className="w">
              <h2 className="rv">{model.compare.title}</h2>
              <p className="lead">{model.compare.lead}</p>
              <ConversionGraphic />
              <div className="cmp-list">
                {model.compare.points.map((point, index) => (
                  <article className={index % 2 ? "cmp-item rv rv-d1" : "cmp-item rv"} key={point.label}>
                    <IconPlate name={COMPARE_ICONS[index] ?? "audience"} />
                    <span className="n">{indexLabel(index)}</span>
                    <h3>{point.label}</h3>
                    <p>{point.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="quiz" id="quiz">
            <div className="w">
              <div>
                <h2 className="rv">{model.quiz.title}</h2>
                <p className="deck rv">{model.quiz.lead}</p>
              </div>
              <HomepageQuiz questions={model.questions} quiz={model.quiz} bookHref={model.bookHref} bookLabel={model.bookLabel} />
            </div>
          </section>

          <section className="faq" id="faq">
            <NetRule />
            <div className="w">
              <h2>{model.faqTitle}</h2>
              <div>
                {model.faq.map((item, index) => (
                  <details key={item.question} open={index === 0}>
                    <summary>
                      <span className="faq-q">{item.question}</span>
                      <FaqMark />
                    </summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          <section className="agency" id={model.agency.id} aria-labelledby="agency-title">
            <div className="w agency-grid">
              <div>
                <p className="kicker mono">{model.agency.kicker}</p>
                <h2 id="agency-title">{model.agency.title}</h2>
                <p className="lead">{model.agency.lead}</p>
                <p className="lead agency-note">{model.agency.note}</p>
                <ul className="points">
                  {model.agency.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
              <div className="agency-card">
                {waitlist === "saved" ? (
                  <div className="agency-success" role="status">
                    <p className="kicker mono">{model.agency.kicker}</p>
                    <h3>{model.agency.savedTitle}</h3>
                    <p>{model.agency.saved}</p>
                  </div>
                ) : (
                  <>
                    {waitlist === "invalid" ? (
                      <p className="notice bad" role="alert">
                        {model.agency.invalid}
                      </p>
                    ) : null}
                    {waitlist === "limited" ? (
                      <p className="notice bad" role="alert">
                        {model.agency.limited}
                      </p>
                    ) : null}
                    <WaitlistForm>
                      <label>
                        {model.agency.nameLabel}
                        <input name="name" autoComplete="name" required maxLength={120} />
                      </label>
                      <label>
                        {model.agency.emailLabel}
                        <input name="email" type="email" autoComplete="email" required maxLength={200} />
                      </label>
                      <label className="full">
                        {model.agency.agencyLabel}
                        <input name="agency" autoComplete="organization" required maxLength={160} />
                      </label>
                      <label className="full">
                        {model.agency.websiteLabel}
                        <input name="website" type="text" inputMode="url" autoComplete="url" maxLength={200} />
                      </label>
                      <label className="full">
                        {model.agency.clientsLabel}
                        <select name="clients" defaultValue="">
                          <option value="">Optional</option>
                          {model.agency.clientOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="full">
                        {model.agency.spendLabel}
                        <select name="spend" defaultValue="">
                          <option value="">Optional</option>
                          {model.agency.spendOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="full">
                        {model.agency.messageLabel}
                        <textarea name="message" rows={3} maxLength={4000} />
                      </label>
                      <div className="sr-only" aria-hidden="true">
                        <label>
                          Company fax
                          <input name="company_fax" tabIndex={-1} autoComplete="off" defaultValue="" />
                        </label>
                      </div>
                      <div className="full">
                        <button className="btn" type="submit">
                          {model.agency.submit}
                        </button>
                      </div>
                    </WaitlistForm>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="con" id={finale.id}>
            <div className="w">
              <div>
                <h2>{finale.title}</h2>
                <p className="lead">{finale.body}</p>
                <div className="ctas">
                  <TryLink model={model} className="btn sec" cta="try-demo-contact" first />
                </div>
              </div>
              <div>
                {notice === "saved" ? (
                  <p className="notice" role="status">
                    {model.contact.saved}
                  </p>
                ) : null}
                {notice === "invalid" ? (
                  <p className="notice bad" role="alert">
                    {model.contact.invalid}
                  </p>
                ) : null}
                <ContactForm>
                  <label>
                    Name
                    <input name="name" autoComplete="name" required />
                  </label>
                  <label>
                    Work email
                    <input name="email" type="email" autoComplete="email" required />
                  </label>
                  <label className="full">
                    Company
                    <input name="company" autoComplete="organization" />
                  </label>
                  <label className="full">
                    {model.contact.running}
                    <textarea name="message" rows={3} required />
                  </label>
                  <div className="full">
                    <button className="btn" type="submit">
                      {model.bookLabel}
                    </button>
                  </div>
                </ContactForm>
              </div>
            </div>
          </section>
        </main>
      </HomepageReveal>

      <footer id="footer">
        <div className="w">
          <div>
            <Wordmark model={model} place="footer" />
            <p className="tag">{model.footer.blurb}</p>
          </div>
          <div className="col">
            <h2>{model.footer.product}</h2>
            <a href="#compare">How it works</a>
            <a href="#proof">Proof</a>
            {model.showExecSummaryBand ? <a href={EXEC_SUMMARY_HREF}>{EXEC_SUMMARY_NAV}</a> : null}
            <a href="#faq">FAQ</a>
            <a href={model.agency.href}>{model.agency.navLabel}</a>
          </div>
          <nav aria-label="Account" className="col">
            <h2>{model.footer.account}</h2>
            <LoginLinks model={model} />
            <TrackedLink href={model.bookHref} cta="book-demo-footer">
              {model.bookLabel}
            </TrackedLink>
          </nav>
          <div className="col">
            <h2>{model.footer.legal}</h2>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
          <div className="legal">
            <span>
              © {model.year} {model.wordmark}, Inc.
            </span>
            <span>{model.tagline}</span>
          </div>
        </div>
      </footer>

      <div className="sticky-cta">
        <TrackedLink href={model.bookHref} cta="book-demo-sticky" className="btn">
          {model.bookLabel}
        </TrackedLink>
      </div>
      <script dangerouslySetInnerHTML={{ __html: HOMEPAGE_MOTION_SCRIPT }} />
      <noscript>
        <style dangerouslySetInnerHTML={{ __html: NOSCRIPT_FINAL }} />
      </noscript>
      <script dangerouslySetInnerHTML={{ __html: HOMEPAGE_REVEAL_SCRIPT }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </div>
  );
}
