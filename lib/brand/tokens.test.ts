import assert from "node:assert/strict";
import test from "node:test";
import { brandTokenCss, brandTokens } from "./tokens";

test("brand tokens are the single source for the tagline, type, and colors", () => {
  assert.equal(brandTokens.wordmark, "Specificity");
  assert.equal(brandTokens.tagline, "Identify. Engage. Convert.");
  assert.equal(brandTokens.font.family, "Inter");
  const css = brandTokenCss();
  assert.match(css, new RegExp(`--brand: ${brandTokens.light.brand}`));
  assert.match(css, new RegExp(`--canvas: ${brandTokens.light.canvas}`));
  assert.match(css, new RegExp(`--font-sans: ${brandTokens.font.stack.replace(/[()]/g, "\\$&")}`));
  assert.match(css, /--ink: #f4f4f5/);
});
