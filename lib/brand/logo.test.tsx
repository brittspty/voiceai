import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandLogo, BrandLogoThemed } from "../../components/brand-logo";
import { brandEmailLogoUrl, brandHeadIcons, brandLogoAlt, brandLogoSrc, brandLogoV2Enabled, type BrandLogoVariant } from "./logo";
import { PRODUCT_HOME_ALT, PRODUCT_LOGO_ALT } from "./names";

const variants: BrandLogoVariant[] = ["lockup", "wordmark", "mark"];

test("BRAND_LOGO_V2 is off by default and accepts the usual on values", () => {
  assert.equal(brandLogoV2Enabled({}), false);
  assert.equal(brandLogoV2Enabled({ BRAND_LOGO_V2: "false" }), false);
  for (const value of ["1", "true", "on", "yes", " TRUE "]) assert.equal(brandLogoV2Enabled({ BRAND_LOGO_V2: value }), true);
  assert.equal(brandHeadIcons({}), null);
});

test("each variant renders its vector file with the right alt text", () => {
  for (const variant of variants) {
    for (const tone of ["dark", "light"] as const) {
      const html = renderToStaticMarkup(createElement(BrandLogo, { variant, tone }));
      assert.match(html, new RegExp(`src="${brandLogoSrc(variant, tone)}"`));
      assert.match(html, new RegExp(`data-brand-logo="${variant}"`));
      assert.match(html, new RegExp(`alt="${brandLogoAlt(variant)}"`));
      assert.ok(brandLogoSrc(variant, tone).endsWith(".svg"), "logos are vector, never a PNG with a baked background");
      assert.ok(existsSync(`public${brandLogoSrc(variant, tone)}`));
    }
  }
  assert.equal(brandLogoAlt("lockup"), PRODUCT_LOGO_ALT);
  assert.equal(brandLogoAlt("mark"), PRODUCT_LOGO_ALT);
  assert.equal(brandLogoAlt("wordmark"), PRODUCT_HOME_ALT);
  assert.equal(PRODUCT_HOME_ALT, "JAI home");
});

test("light tone uses only the -light files and dark tone the dark files", () => {
  for (const variant of variants) {
    assert.match(brandLogoSrc(variant, "light"), /-light\.svg$/);
    assert.doesNotMatch(brandLogoSrc(variant, "dark"), /-light/);
  }
  assert.equal(brandLogoSrc("mark", "dark"), "/brand/jai/jai-mark.svg");
});

test("themed logo renders both tones, swapped by the next-themes dark class", () => {
  const html = renderToStaticMarkup(createElement(BrandLogoThemed, { variant: "wordmark", className: "h-7" }));
  assert.match(html, /jai-wordmark-light\.svg"[^>]*class="dark:hidden h-7"|class="dark:hidden h-7"[^>]*jai-wordmark-light/);
  assert.match(html, /hidden dark:block h-7/);
});

test("alt can be overridden, and the email logo is an absolute light PNG", () => {
  assert.match(renderToStaticMarkup(createElement(BrandLogo, { variant: "lockup", alt: "" })), /alt=""/);
  assert.equal(brandEmailLogoUrl("https://jai.example.test/"), "https://jai.example.test/brand/jai/jai-lockup-light@2x.png");
  const icons = brandHeadIcons({ BRAND_LOGO_V2: "on" });
  assert.equal(icons?.manifest, "/brand/jai/site.webmanifest");
  for (const path of ["/brand/jai/favicon.ico", "/brand/jai/favicon-32.png", "/brand/jai/apple-touch-icon.png", "/brand/jai/favicon-192.png", "/brand/jai/favicon-512.png", "/brand/jai-og-v2.png"]) assert.ok(existsSync(`public${path}`), path);
});
