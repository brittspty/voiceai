import { PRODUCT_WORDMARK } from "@/lib/brand";
import { PUBLIC_AD_LINE, PUBLIC_TAGLINE, publicLogoSize, publicLogos } from "@/lib/brand/public";

/** Wordmark plus the locked tagline. Dark surface uses the light-metal asset. */
export function ProductLockup({
  surface,
  size = "header",
}: {
  surface: "dark" | "light";
  size?: "header" | "banner" | "closing";
}) {
  const src = surface === "dark" ? publicLogos.wordmarkDark : publicLogos.wordmarkLight;
  const large = size !== "header";
  const height = large ? 92 : 52;
  const box = publicLogoSize("wordmark", height);
  const titleClass = large
    ? "text-3xl font-semibold tracking-tight md:text-4xl"
    : "text-sm font-semibold leading-tight sm:text-base";
  const titleColor = surface === "dark" ? "text-white" : "text-ink";
  const Title = size === "closing" ? "h1" : "p";
  return (
    <div className={`flex gap-4 ${large ? "flex-col items-start" : "items-center"}`}>
      <img src={src} alt={PRODUCT_WORDMARK} width={box.width} height={box.height} className={large ? "h-[92px] w-auto" : "h-[52px] w-auto"} />
      <div>
        <Title className={`${titleClass} ${titleColor}`}>{PUBLIC_TAGLINE}</Title>
        {large ? <p className="mt-2 text-sm font-semibold text-brand">{PUBLIC_AD_LINE}</p> : null}
      </div>
    </div>
  );
}
