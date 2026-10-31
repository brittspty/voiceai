import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { brandTokenCss, brandTokens } from "./tokens";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("brand tokens are the single source for the tagline, type, and colors", () => {
  assert.equal(brandTokens.wordmark, "Specificity");
  assert.equal(brandTokens.tagline, "Identify. Engage. Convert.");
  assert.equal(brandTokens.font.family, "Poppins");
  assert.equal(brandTokens.light.brand, "#FF5800");
  assert.equal(brandTokens.logo.src, "/brand/specificity-mark.png");
  const css = brandTokenCss();
  assert.match(css, new RegExp(`--brand: ${brandTokens.light.brand}`));
  assert.match(css, new RegExp(`--brand-ink: ${brandTokens.light.brandInk}`));
  assert.match(css, /--ink: #231F20/);
  assert.match(css, /--font-sans: var\(--font-brand\), "Segoe UI", Arial, Helvetica, sans-serif/);
});

test("the app shell uses Specificity token colors and the brand font", () => {
  const shell = readFileSync(path.join(ROOT, "components/shell.tsx"), "utf8");
  const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
  const layout = readFileSync(path.join(ROOT, "app/layout.tsx"), "utf8");
  assert.equal(/zinc-|amber-|emerald-|slate-|#FF5800|#231F20/.test(shell), false);
  assert.match(shell, /text-muted/);
  assert.match(shell, /bg-warning-soft/);
  assert.match(shell, /bg-success-soft/);
  assert.match(shell, /font-sans/);
  assert.match(css, /--font-brand\), "Segoe UI", Arial, Helvetica, sans-serif/);
  assert.match(layout, /brandTokenCss/);
  assert.match(layout, /Poppins/);
  assert.equal(layout.includes('["--brand"'), false);
  assert.equal(brandTokens.font.family, "Poppins");
});
