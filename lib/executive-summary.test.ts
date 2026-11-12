import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";
import { isPublicPath } from "./public-routing";

const FILES: Record<string, string> = {
  "public/executive-summary/index.html": "3043aa6d9210fd8ec97f6c4874df33c0d59b2d7f21251d8ee9118d7e530d96b3",
  "public/executive-summary/jai-executive-summary-nov-2026.pdf": "d6ae150a8152fb8a4eea8fc5f33d4c06cb9e7d32cecf3dcb9974d061fe2ba4bc",
  "public/executive-summary/og-executive-summary.jpg": "9f37e1a4471eb61c099d8b6c7f8e56c8aa2b0ed1003213f1731ee2d1b058b789",
  "public/executive-summary/thumbs/page-01-card.jpg": "4da802426f6fabd70dbeb37bf2bc1357959e2ca8ffb7684bdada9ebcf7d19d4d",
  "public/executive-summary/thumbs/page-01-card.webp": "1bb1aa1ff8e31f3f371de809a621a19fa55b0241f5de4c7a670e669c71329792",
  "public/executive-summary/thumbs/page-01.jpg": "fb7fed577391f6f3ec31444e74bc97a0b07a8c1eee372ee4a47677acc782e186",
  "public/executive-summary/thumbs/page-01.webp": "71dac3923613c9c73f1294c737d20ef56fb1140064d171f373a2767340f588f5",
  "public/executive-summary/thumbs/page-03.jpg": "af1c8df53dd16dc7a74eb04d42052a40521f484b7ede7676cfa6375907d8546d",
  "public/executive-summary/thumbs/page-03.webp": "d38b05d3540ed7f05623e171578f0e2e37dc24551b5669467e886a0541f41048",
  "public/executive-summary/thumbs/page-05.jpg": "f9b598be6f3db3d4e30aac5f4802670944f7466987e53b36308f8f97209af685",
  "public/executive-summary/thumbs/page-05.webp": "97818188fdf1e717da6cfa898d7ac1358438e028de1937666a4a234668ea9fb9",
  "public/executive-summary/thumbs/page-09.jpg": "9362b5c1cb55c0649e119161a41b6be13d0ae65d53a1b92788c935db7631a11c",
  "public/executive-summary/thumbs/page-09.webp": "ce837ce716a174e3a236a47df0e5568ab4cc47ddd027a928871bf97916bba6e1",
};

function request(pathname: string) {
  return new NextRequest(`http://voiceops.test${pathname}`);
}

test("executive summary files match the frozen bytes Next serves from public", () => {
  for (const [file, want] of Object.entries(FILES)) {
    const hash = createHash("sha256").update(readFileSync(new URL(`../${file}`, import.meta.url))).digest("hex");
    assert.equal(hash, want, file);
  }
});

test("executive summary is public and its directory URL keeps relative links working", async () => {
  assert.equal(isPublicPath("/executive-summary", {}), true);
  assert.equal(isPublicPath("/executive-summary/", {}), true);
  assert.equal(isPublicPath("/executive-summary/thumbs/page-01.webp", { PUBLIC_HOMEPAGE: "off" }), true);

  const bare = await proxy(request("/executive-summary"));
  assert.equal(bare.status, 308);
  assert.equal(new URL(bare.headers.get("location") || "").pathname, "/executive-summary/");

  const page = await proxy(request("/executive-summary/"));
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("location"), null);
  assert.match(page.headers.get("x-middleware-rewrite") || "", /\/executive-summary\/index\.html$/);

  const home = await proxy(request("/index.html"));
  assert.equal(home.status, 308);
  assert.equal(new URL(home.headers.get("location") || "").pathname, "/");

  const hashed = await proxy(request("/index.html?keep=1"));
  const hashedUrl = new URL(hashed.headers.get("location") || "");
  assert.equal(hashedUrl.pathname, "/");
  assert.equal(hashedUrl.search, "?keep=1");

  const pdf = await proxy(request("/executive-summary/jai-executive-summary-nov-2026.pdf"));
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("location"), null);

  const login = await proxy(request("/login/"));
  assert.equal(login.status, 308);
  assert.equal(new URL(login.headers.get("location") || "").pathname, "/login");
});
