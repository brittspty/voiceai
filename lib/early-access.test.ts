import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/early-access/route";
import { proxy } from "../proxy";
import { AGENCY_WAITLIST_HREF } from "./homepage-cta";
import { isPublicPath, protoDesignRedirect } from "./public-routing";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HASH = "7542a88aa9051cecd6f56f7bfc784ba5609430ee28b69caa18d10269f12d799d";
const SOURCE = "content/early-access/source.html";

const ASSETS: Record<string, string> = {
  "jai-favicon-32.png": "public/brand/jai-favicon-32.png",
  "grain-tile.png": "public/homepage/grain-tile.png",
  "jai-wordmark-dark.svg": "public/brand/jai-wordmark-dark.svg",
  "hero-network-1440.webp": "public/homepage/hero-network-1440.webp",
  "jai-lockup-dark.svg": "public/brand/jai-lockup-dark.svg",
};

function bytes(file: string) {
  return readFileSync(join(ROOT, file));
}

function sha(file: string) {
  return createHash("sha256").update(bytes(file)).digest("hex");
}

async function withHomepage<T>(value: string | undefined, run: () => Promise<T>) {
  const previous = process.env.PUBLIC_HOMEPAGE;
  if (value === undefined) delete process.env.PUBLIC_HOMEPAGE;
  else process.env.PUBLIC_HOMEPAGE = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_HOMEPAGE;
    else process.env.PUBLIC_HOMEPAGE = previous;
  }
}

function request(pathname: string) {
  return new NextRequest(`http://voiceops.test${pathname}`);
}

test("early access html and the served body match the compliance hash", async () => {
  assert.equal(sha(SOURCE), HASH);
  await withHomepage(undefined, async () => {
    const hidden = GET();
    assert.equal(hidden.status, 404);
    assert.equal(hidden.headers.get("x-robots-tag"), "noindex, nofollow");
  });
  await withHomepage("on", async () => {
    const response = GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(body.equals(bytes(SOURCE)), true);
    assert.equal(createHash("sha256").update(body).digest("hex"), HASH);
  });
});

test("proto-d assets are the homepage files and the page links are not rewritten", () => {
  for (const [name, source] of Object.entries(ASSETS)) {
    assert.equal(sha(`public/proto-d/assets/${name}`), sha(source), name);
  }
  const html = bytes(SOURCE).toString("utf8");
  assert.match(html, /\.\.\/proto-d\/assets\/jai-lockup-dark\.svg/);
  assert.match(html, /\.\.\/proto-d\/index\.html#contact/);
  assert.match(html, /\.\.\/proto-d\/executive-summary\//);
  assert.match(html, /href="\.\/"/);
  assert.equal(html.includes("/early-access"), false);
});

test("proto-d redirects preserve the homepage and stay off when the flag is off", async () => {
  assert.equal(protoDesignRedirect("/proto-d/index.html", {}), null);
  assert.equal(protoDesignRedirect("/proto-d/executive-summary/", {}), null);
  assert.equal(protoDesignRedirect("/proto-d/index.html", { PUBLIC_HOMEPAGE: "on" }), "/");
  assert.equal(protoDesignRedirect("/proto-d/executive-summary/", { PUBLIC_HOMEPAGE: "on" }), "/executive-summary/");

  const homeOff = await proxy(request("/proto-d/index.html"), {});
  assert.equal(homeOff.status, 200);
  assert.equal(homeOff.headers.get("location"), null);

  const summaryOff = await proxy(request("/proto-d/executive-summary/"), {});
  assert.equal(summaryOff.status, 308);
  assert.equal(new URL(summaryOff.headers.get("location") || "").pathname, "/proto-d/executive-summary");

  const home = await proxy(request("/proto-d/index.html?keep=1"), { PUBLIC_HOMEPAGE: "on" });
  assert.equal(home.status, 308);
  const homeUrl = new URL(home.headers.get("location") || "");
  assert.equal(homeUrl.pathname, "/");
  assert.equal(homeUrl.search, "?keep=1");

  const summary = await proxy(request("/proto-d/executive-summary/"), { PUBLIC_HOMEPAGE: "on" });
  assert.equal(summary.status, 308);
  assert.equal(new URL(summary.headers.get("location") || "").pathname, "/executive-summary/");

  const bare = await proxy(request("/proto-d/executive-summary"), { PUBLIC_HOMEPAGE: "on" });
  assert.equal(bare.status, 308);
  assert.equal(new URL(bare.headers.get("location") || "").pathname, "/executive-summary/");
});

test("early access is public, unlinked, and absent from sitemap and robots rules", async () => {
  assert.equal(isPublicPath("/early-access", {}), true);
  assert.equal(isPublicPath("/early-access", { PUBLIC_HOMEPAGE: "on" }), true);
  assert.equal(isPublicPath("/proto-d/assets/grain-tile.png", {}), true);
  assert.equal(AGENCY_WAITLIST_HREF, "#agency-waitlist");

  const signedOut = await proxy(request("/early-access"), {});
  assert.equal(signedOut.headers.get("x-middleware-next"), "1");
  assert.equal(signedOut.headers.get("location"), null);
  const asset = await proxy(request("/proto-d/assets/jai-wordmark-dark.svg"), {});
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("location"), null);

  const homepage = readFileSync(join(ROOT, "lib/homepage-content.ts"), "utf8");
  assert.match(homepage, /jAI runs our own client campaigns today/);
  assert.equal(homepage.includes("/early-access"), false);
  assert.equal(readFileSync(join(ROOT, "components/public-homepage.tsx"), "utf8").includes("/early-access"), false);

  for (const file of ["app/sitemap.ts", "app/sitemap.js", "app/robots.ts", "app/robots.js", "public/robots.txt", "public/sitemap.xml"]) {
    if (!existsSync(join(ROOT, file))) continue;
    const text = readFileSync(join(ROOT, file), "utf8");
    assert.equal(text.includes("/early-access"), false, file);
    assert.equal(/disallow:\s*\/early-access/i.test(text), false, file);
  }

  const allow = new Set(["lib/public-routing.ts", "lib/early-access.test.ts"]);
  const linked: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".git" || entry === ".next") continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      const rel = relative(ROOT, path);
      if (allow.has(rel)) continue;
      if (!/\.(ts|tsx|js|jsx|css|md|html|txt|xml|json)$/.test(rel)) continue;
      const text = readFileSync(path, "utf8");
      if (text.includes('"/early-access"') || text.includes("'/early-access'")) linked.push(rel);
    }
  }
  walk(ROOT);
  assert.deepEqual(linked, []);
});
