import assert from "node:assert/strict";
import test from "node:test";
import { brandTokenCss, brandTokens } from "./tokens";

test("brand tokens are the single source for the tagline, type, and colors", () => {
  assert.equal(brandTokens.wordmark, "Specificity");
  assert.equal(brandTokens.tagline, "Identify. Engage. Convert.");
  assert.equal(brandTokens.font.family, "Poppins");
  assert.equal(brandTokens.font.mono, "IBM Plex Mono");
  assert.equal(brandTokens.light.brand, "#FF5800");
  assert.equal(brandTokens.logo.src, "/brand/specificity-mark.png");
  assert.equal(brandTokens.logo.full, "/brand/specificity-logo-full.png");
  assert.equal(brandTokens.logo.reversed, "/brand/specificity-logo-reversed.png");
  const css = brandTokenCss();
  assert.match(css, new RegExp(`--brand: ${brandTokens.light.brand}`));
  assert.match(css, new RegExp(`--brand-ink: ${brandTokens.light.brandInk}`));
  assert.match(css, /--ink: #231F20/);
});
