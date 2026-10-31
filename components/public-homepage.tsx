import Image from "next/image";
import Link from "next/link";
import { HomepageFeed } from "@/components/homepage-feed";
import { HomepageMenu } from "@/components/homepage-header";
import { HOMEPAGE_SECTION_ORDER, type HomepageModel } from "@/lib/homepage-content";
import { homepageStyle } from "@/lib/homepage-style";

function LoginLinks({ model, className }: { model: HomepageModel; className?: string }) {
  return (
    <div className={className}>
      {model.signedIn ? (
        <Link className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold underline" href={model.appHref}>
          Go to app
        </Link>
      ) : null}
      <Link className="btn-brand inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm" href={model.logins[0].href}>
        {model.logins[0].label}
      </Link>
      <Link className="inline-flex min-h-11 items-center justify-center rounded-full border border-current px-4 text-sm font-semibold" href={model.logins[1].href}>
        {model.logins[1].label}
      </Link>
    </div>
  );
}

function DemoActions({ model, buttonClass, ghostClass }: { model: HomepageModel; buttonClass: string; ghostClass: string }) {
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <Link className={buttonClass} href={model.bookHref}>
        {model.bookLabel}
      </Link>
      {model.showTryDemo ? (
        <Link className={ghostClass} href={model.demoHref}>
          {model.tryLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function PublicHomepage({ model, notice = null }: { model: HomepageModel; notice?: "saved" | "invalid" | null }) {
  const style = homepageStyle(model.direction);
  const heading = { fontFamily: model.fonts.sans };
  return (
    <div
      data-direction={style.id}
      data-sections={HOMEPAGE_SECTION_ORDER.join(" ")}
      className="min-h-screen"
      style={{ background: model.canvas, color: model.ink, ["--brand" as string]: model.brandColor }}
    >
      <header id="header" className="mx-auto flex max-w-6xl items-start justify-between gap-3 px-4 py-5">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image src={model.logos.full} alt={model.logos.alt} width={1389} height={645} className="h-10 w-auto" />
          <span className="min-w-0">
            <span className="block text-lg font-semibold" style={heading}>
              {model.product}
            </span>
            <span className="block text-sm">{model.byline}</span>
          </span>
        </Link>
        <HomepageMenu>
          <LoginLinks model={model} className="flex flex-col gap-2 md:flex-row md:items-center" />
        </HomepageMenu>
      </header>

      <main>
        <section id="hero" className={`mx-auto max-w-6xl px-4 py-12 ${style.hero}`}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ fontFamily: model.fonts.mono, color: model.brandColor }}>
              {model.hero.kicker}
            </p>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-tight" style={heading}>
              {model.hero.title}
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-8">{model.hero.body}</p>
          </div>
          <HomepageFeed items={model.feed} className={style.feed} mono={model.fonts.mono} />
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-semibold" style={heading}>
            PLACEHOLDER. How it works
          </h2>
          <ol className={`mt-6 ${style.steps}`}>
            {model.steps.map((step) => (
              <li key={step.title} className="rounded-2xl border border-line bg-card p-4">
                <h3 className="font-semibold" style={heading}>
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {model.bands.map((band) => {
          const primary = band.tone === "primary";
          return (
            <section key={band.id} id={band.id} className={primary ? style.band : style.bandAlt}>
              <div className="mx-auto max-w-6xl">
                <h2 className="text-2xl font-semibold" style={heading}>
                  {band.title}
                </h2>
                <p className="mt-2 max-w-2xl leading-7">{band.body}</p>
                <DemoActions model={model} buttonClass={primary ? style.bandButton : style.bandAltButton} ghostClass={primary ? style.bandGhost : style.bandAltGhost} />
              </div>
            </section>
          );
        })}

        <section id="proof" className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-semibold" style={heading}>
            {model.proof.title}
          </h2>
          <p className="mt-2 max-w-2xl leading-7">{model.proof.body}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {model.proof.cards.map((card) => (
              <article key={card.title} className="rounded-2xl border border-dashed border-line bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ fontFamily: model.fonts.mono, color: model.brandColor }}>
                  {model.placeholder}
                </p>
                <h3 className="mt-2 font-semibold" style={heading}>
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-6">{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-semibold" style={heading}>
            PLACEHOLDER. Questions
          </h2>
          <div className="mt-6 space-y-3">
            {model.faq.map((item) => (
              <details key={item.question} className="rounded-2xl border border-line bg-card p-4">
                <summary className="cursor-pointer font-semibold" style={heading}>
                  {item.question}
                </summary>
                <p className="mt-2 text-sm leading-6">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="contact" className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-2xl font-semibold" style={heading}>
            {model.contact.title}
          </h2>
          <p className="mt-2 max-w-2xl leading-7">{model.contact.body}</p>
          {notice === "saved" ? (
            <p className="mt-4 text-sm" role="status">
              {model.contact.saved}
            </p>
          ) : null}
          {notice === "invalid" ? (
            <p className="mt-4 text-sm text-danger" role="alert">
              {model.contact.invalid}
            </p>
          ) : null}
          <form action="/api/homepage/contact" method="post" className="mt-6 grid max-w-xl gap-3">
            <label className="text-sm font-semibold" style={heading}>
              Name
              <input name="name" required autoComplete="name" className="mt-1 h-11 w-full rounded-lg border border-line bg-card px-3 font-normal" />
            </label>
            <label className="text-sm font-semibold" style={heading}>
              Email
              <input name="email" type="email" required autoComplete="email" className="mt-1 h-11 w-full rounded-lg border border-line bg-card px-3 font-normal" />
            </label>
            <label className="text-sm font-semibold" style={heading}>
              Company
              <input name="company" autoComplete="organization" className="mt-1 h-11 w-full rounded-lg border border-line bg-card px-3 font-normal" />
            </label>
            <label className="text-sm font-semibold" style={heading}>
              Message
              <textarea name="message" required rows={4} className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 font-normal" />
            </label>
            <button className="btn-brand h-11 rounded-full px-4 text-sm" type="submit">
              Save message
            </button>
          </form>
        </section>
      </main>

      <footer id="footer" className="border-t border-line">
        {/* TODO(jason): Privacy wording, pricing, and reply-time promises need Jason's sign-off before they can be added. */}
        <div className="bg-ink">
          <div className="mx-auto max-w-6xl px-4 py-4">
            <Image src={model.logos.reversed} alt="" width={1427} height={498} className="h-8 w-auto" />
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8">
          <Image src={model.logos.mark} alt="" width={1349} height={432} className="h-8 w-auto" />
          <nav aria-label="Sign in" className="flex flex-wrap items-center gap-2">
            <LoginLinks model={model} className="flex flex-wrap items-center gap-2" />
          </nav>
        </div>
      </footer>
    </div>
  );
}
