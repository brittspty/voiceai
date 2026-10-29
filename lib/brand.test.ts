import assert from "node:assert/strict";
import test from "node:test";
import { PLACEHOLDER_BRAND_COLOR, PLACEHOLDER_LOGO_URL, PRODUCT_NAME, resolveBrandColor, resolveLogoUrl } from "./brand";

test("Specificity placeholders fill in an unset brand", () => {
  assert.equal(PRODUCT_NAME, "VoiceOps");
  assert.equal(resolveBrandColor(""), PLACEHOLDER_BRAND_COLOR);
  assert.equal(resolveBrandColor("#2563eb"), "#FF5800");
  assert.equal(resolveBrandColor("#112233"), "#112233");
  assert.equal(resolveLogoUrl(""), PLACEHOLDER_LOGO_URL);
  assert.equal(resolveLogoUrl("https://cdn.example.com/a.png"), "https://cdn.example.com/a.png");
});
