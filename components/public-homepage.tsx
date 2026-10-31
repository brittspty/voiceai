import Image from "next/image";
import { AfterArt, BeforeArt, CameraArt, PersonArt, TurnArt } from "@/components/homepage-art";
import { TrackedLink } from "@/components/homepage-cta-link";
import { ContactForm } from "@/components/homepage-contact-form";
import { HomepageDemo } from "@/components/homepage-demo";
import { HomepageFeed } from "@/components/homepage-feed";
import { HomepageField } from "@/components/homepage-field";
import { HomepageMenu } from "@/components/homepage-header";
import { HomepageQuiz } from "@/components/homepage-quiz";
import { HOMEPAGE_REVEAL_SCRIPT, HomepageReveal } from "@/components/homepage-reveal";
import { RecommendationSlip } from "@/components/homepage-slip";
import { HOMEPAGE_SECTION_ORDER, homepageJsonLd, type HomepageModel } from "@/lib/homepage-content";
import { homepageStyle } from "@/lib/homepage-style";

const BEAT_ART = [BeforeArt, TurnArt, AfterArt];

function Wordmark({ model, large = false }: { model: HomepageModel; large?: boolean }) {
  return (
    <Image src={model.logos.reversed} alt={large ? "" : model.logos.alt} width={1427} height={498} priority={!large} className={large ? "wordmark-lg" : "wordmark"} style={{ width: "auto", height: large ? 44 : 30 }} />
  );
}

function LoginLinks({ model, variant }: { model: HomepageModel; variant: "desk" | "menu" | "footer" }) {
  return (
    <>
      {model.signedIn ? (
        <TrackedLink href={model.appHref} cta="go-app" className="go-app">
          Go to app
        </TrackedLink>
      ) : null}
      <TrackedLink href={model.logins[0].href} cta={model.logins[0].cta} className={variant === "desk" ? "client-login" : undefined}>{model.logins[0].label}</TrackedLink>
      <TrackedLink href={model.logins[1].href} cta={model.logins[1].cta} className="team-login">{model.logins[1].label}</TrackedLink>
    </>
  );
}

function TryLink({ model, className, cta, first = false }: { model: HomepageModel; className: string; cta: string; first?: boolean }) {
  if (!model.showTryDemo) return null;
  return (
    <TrackedLink href={model.demoHref} cta={cta} className={className}>{first ? model.tryFirstLabel : model.tryLabel}</TrackedLink>
  );
}

function Photo({ caption, wide = false, person = false, team = false }: { caption: string; wide?: boolean; person?: boolean; team?: boolean }) {
  const shape = wide ? "photo photo-wide" : team ? "photo photo-team" : "photo";
  return (
    <figure className={shape}>
      {person ? <PersonArt /> : <CameraArt />}
      <figcaption>{caption}</figcaption>
    </figure>
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
  origin = null,
}: {
  model: HomepageModel;
  notice?: "saved" | "invalid" | null;
  origin?: string | null;
}) {
  const style = homepageStyle(model.direction);
  const jsonLd = JSON.stringify(homepageJsonLd(origin)).replace(/</g, "\\u003c");
  const band = model.bands[0];
  const finale = model.bands[1];

  return (
    <div className={`home ${style.hero}`} data-direction={style.id} data-sections={HOMEPAGE_SECTION_ORDER.join(" ")} style={{ ["--brand" as string]: model.brandColor, fontFamily: model.fonts.sans }}>
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      <a className="skip" href="#hero">
        Skip to content
      </a>
      <header id="header" className="site-header">
        <div className="w topbar">
          <a href="#hero" aria-label={model.logos.alt}>
            <Wordmark model={model} />
          </a>
          <nav className="desk-nav" aria-label="Main">
            {model.nav.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="desk-logins">
            <LoginLinks model={model} variant="desk" />
            <TrackedLink href={model.bookHref} cta="book-demo-header" className="btn">
              {model.bookLabel}
            </TrackedLink>
          </div>
          <HomepageMenu>
            {model.menuNav.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
            <LoginLinks model={model} variant="menu" />
            <TrackedLink href={model.bookHref} cta="book-demo-menu" className="btn">
              {model.bookLabel}
            </TrackedLink>
          </HomepageMenu>
        </div>
      </header>

      <HomepageReveal>
        <main>
          <section className="hero" id="hero" aria-labelledby="h1">
            <HomepageField />
            <p className="legend mono">
              <span>
                <i className="swatch-dim" />
                {model.hero.legend[0]}
              </span>
              <span>
                <i className="swatch-paper" />
                {model.hero.legend[1]}
              </span>
              <span>
                <i className="swatch-brand" />
                {model.hero.legend[2]}
              </span>
              <span className="tag">{model.illustrative}</span>
            </p>
            <div className="w">
              <h1 id="h1">
                {model.hero.title}<em>.</em>
              </h1>
              <div className="row">
                <p className="sub">
                  {model.hero.before}
                  <b>{model.hero.emphasis}</b>
                  {model.hero.after}
                </p>
                <div className="ctas">
                  <TrackedLink href={model.bookHref} cta="book-demo-hero" className="btn">
                    {model.bookLabel}
                  </TrackedLink>
                  <TryLink model={model} className="btn sec" cta="try-demo-hero" />
                </div>
              </div>
              <div className="tagline mono">
                <span>{model.tagline}</span>
                <span>
                  {model.product} {model.byline}
                </span>
              </div>
            </div>
          </section>

          <section className="pillars" id="pillars" aria-labelledby="pillars-title">
            <div className="w">
              <h2 id="pillars-title" className="sr-only">
                {model.tagline}
              </h2>
              <div className="pillars-grid">
                {model.pillars.map((pillar) => (
                  <article key={pillar.title}>
                    <h3>{pillar.title}</h3>
                    <p>{pillar.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="story" id="story">
            <div className="w">
              <h2 className="rv">{model.story.title}</h2>
              <p className="lead rv">{model.story.lead}</p>
              <div className="beats">
                {model.story.beats.map((beat, index) => {
                  const Art = BEAT_ART[index] ?? BeforeArt;
                  return (
                    <article className="beat rv" key={beat.label}>
                      <Art />
                      <span className="lab mono">{beat.label}</span>
                      <h3>{beat.title}</h3>
                      <p>{beat.body}</p>
                    </article>
                  );
                })}
              </div>
              <Photo caption={model.story.photo} wide />
            </div>
          </section>

          <section className="proof" id="proof">
            <div className="w">
              <div className="top rv">
                <h2>{model.proof.title}</h2>
                <p className="lead">{model.proof.lead}</p>
              </div>
              <div className="logo-row" aria-label="Client logos">
                {model.proof.logos.map((logo, index) => (
                  <div className="slot logo-slot" key={`${logo}-${index}`}>
                    <span className="mono lab">LOGO</span>
                    <b>{logo}</b>
                  </div>
                ))}
              </div>
              <div className="pg rv">
                <div className="method">
                  <span className="lab mono">The method</span>
                  <h3>{model.proof.methodTitle}</h3>
                  <p className="lead">{model.proof.methodBody}</p>
                  <ol>
                    {model.proof.method.map((step) => (
                      <li key={step.label}>
                        <span className="mono">{step.label}</span>
                        {step.body}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="tour" id="tour">
                  <div>
                    <span className="lab mono">Demo tour</span>
                    <h3>{model.proof.tourTitle}</h3>
                    <p>{model.proof.tourBody}</p>
                  </div>
                  <TryLink model={model} className="btn sec" cta="try-demo-tour" />
                </div>
                {model.proof.slots.map((slot) => (
                  <div className="slot" key={slot.kicker}>
                    <span className="mono lab">{slot.kicker}</span>
                    <b>{slot.title}</b>
                    <span className="lab">{slot.note}</span>
                  </div>
                ))}
              </div>
              <div className="voices">
                <div className="quote">
                  <span className="mono lab">{model.proof.quotes[0]?.kicker}</span>
                  <p>{model.proof.quotes[0]?.body}</p>
                  <span className="lab">{model.proof.quotes[0]?.note}</span>
                </div>
                <Photo caption={model.proof.quotePhoto} person />
                <div className="quote">
                  <span className="mono lab">{model.proof.quotes[1]?.kicker}</span>
                  <p>{model.proof.quotes[1]?.body}</p>
                  <span className="lab">{model.proof.quotes[1]?.note}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="how" id="how-it-works">
            <div className="w">
              <h2>Here is what happens to your money.</h2>
              <div className="flow rv">
                {model.steps.map((step) => (
                  <article className="fs" key={step.title}>
                    <span className="lab mono">{step.kicker}</span>
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
              <p className="lab mono">{model.stepsNote}</p>
            </div>
          </section>

          <section className="band" id={band.id} aria-label={band.title}>
            <div className="w">
              <h2>{band.title}</h2>
              <div className="ctas">
                <TrackedLink href={model.bookHref} cta="book-demo-band" className="btn">
                  {model.bookLabel}
                </TrackedLink>
                <TryLink model={model} className="btn sec" cta="try-demo-band" />
              </div>
            </div>
          </section>

          <section className="demo" id="demo">
            <div className="w">
              <p className="lab mono rv">{model.demo.kicker}</p>
              <h2 className="rv">{model.demo.title}</h2>
              <p className="lead rv">{model.demo.lead}</p>
              <div className="dg rv">
                <HomepageDemo segments={model.segments} illustrative={model.illustrative} group={model.demo.group} barNote={model.demo.barNote} />
                <div className="panel">
                  <div className="ph mono">
                    <span>JARVIS DECISION FEED</span>
                    <span>{model.example}</span>
                  </div>
                  <HomepageFeed items={model.feed} example={model.example} />
                  <p className="mono lab">{model.demo.feedNote}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="hum" id="platform">
            <div className="w hum-grid">
              <div>
                <blockquote>
                  {model.platform.quote} <span>{model.platform.accent}</span>
                </blockquote>
                <ul>
                  {model.platform.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <div className="team">
                  {[0, 1, 2].map((index) => (
                    <Photo key={index} caption={model.platform.photos} person team />
                  ))}
                </div>
                <p className="lab">{model.platform.note}</p>
              </div>
              <RecommendationSlip illustrative={model.illustrative} title={model.slip.title} body={model.slip.body} why={model.slip.why} />
            </div>
          </section>

          <section className="mods" id="modules">
            <div className="w mods-grid">
              <h2>{model.modulesTitle}</h2>
              <div>
                {model.modules.map((row) => (
                  <article className="mr" key={row.title}>
                    <h3>{row.title}</h3>
                    <p>{row.body}</p>
                    <span className="mono">{row.meta}</span>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="compare" id="compare">
            <div className="w">
              <h2>{model.compare.title}</h2>
              <p className="lead">{model.compare.lead}</p>
              <div className="cmp">
                {model.compare.rows.map((row) => (
                  <article key={row.label}>
                    <h3>{row.label}</h3>
                    <div className="cmp-cols">
                      {row.cells.map((cell, index) => (
                        <p key={model.compare.columns[index]}>
                          <span className="lab mono">{model.compare.columns[index]}</span>
                          {cell}
                        </p>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="quiz" id="quiz">
            <div className="w quiz-grid">
              <div>
                <h2 className="rv">{model.quiz.title}</h2>
                <p className="lead rv">{model.quiz.lead}</p>
              </div>
              <HomepageQuiz questions={model.questions} quiz={model.quiz} bookHref={model.bookHref} bookLabel={model.bookLabel} />
            </div>
          </section>

          <section className="faq" id="faq">
            <div className="w faq-grid">
              <h2>{model.faqTitle}</h2>
              <div>
                {model.faq.map((item, index) => (
                  <details key={item.question} open={index === 0}>
                    <summary>{item.question}</summary>
                    <p>{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          <section className="con" id={finale.id}>
            <div className="w con-grid">
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
            <Wordmark model={model} large />
            <p style={{ marginTop: 16, maxWidth: "30ch" }}>{model.footer.blurb}</p>
          </div>
          <div>
            <h2>{model.footer.product}</h2>
            <a href="#how-it-works">How it works</a>
            <a href="#proof">Proof</a>
            <a href="#faq">FAQ</a>
          </div>
          <nav aria-label="Account">
            <h2>{model.footer.account}</h2>
            <LoginLinks model={model} variant="footer" />
            <TrackedLink href={model.bookHref} cta="book-demo-footer">
              {model.bookLabel}
            </TrackedLink>
          </nav>
          <div>
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
      <script dangerouslySetInnerHTML={{ __html: HOMEPAGE_REVEAL_SCRIPT }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </div>
  );
}
