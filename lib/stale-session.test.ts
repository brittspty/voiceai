import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/auth/logout/route";
import { proxy } from "../proxy";
import { requireUser } from "./auth";
import { prisma } from "./db";
import { SESSION_COOKIE, signToken } from "./session-token";

const require = createRequire(import.meta.url);
const { workUnitAsyncStorage } = require("next/dist/server/app-render/work-unit-async-storage.external.js");
const { workAsyncStorage } = require("next/dist/server/app-render/work-async-storage.external.js");
const { RequestCookies } = require("next/dist/server/web/spec-extension/cookies.js");

const ORIGIN = "http://voiceops.test";

function redirectTarget(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) return null;
  const digest = String((error as { digest: unknown }).digest);
  if (!digest.startsWith("NEXT_REDIRECT;")) return null;
  return digest.split(";").slice(2, -2).join(";");
}

function request(pathname: string, token?: string) {
  const headers = new Headers();
  if (token !== undefined) headers.set("cookie", `${SESSION_COOKIE}=${token}`);
  return new NextRequest(`${ORIGIN}${pathname}`, { headers });
}

function withSessionCookie<T>(token: string, run: () => Promise<T>) {
  const jar = new RequestCookies(new Headers({ cookie: `${SESSION_COOKIE}=${token}` }));
  const unit = {
    type: "request",
    phase: "render",
    cookies: jar,
    mutableCookies: jar,
    userspaceMutableCookies: jar,
  };
  return workAsyncStorage.run({ route: "/" }, () => workUnitAsyncStorage.run(unit, run));
}

test("stale signed voiceops_session lands on /login with the cookie cleared", async () => {
  const sid = "missing-session";
  const token = await signToken({
    kind: "session",
    sid,
    role: "owner",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const home = await proxy(request("/", token));
  assert.equal(home.headers.get("location"), null);

  const bounced = await proxy(request("/login", token));
  assert.equal(new URL(bounced.headers.get("location") || "", ORIGIN).pathname, "/");

  const originalFind = prisma.session.findUnique;
  const originalDelete = prisma.session.delete;
  let deletedId: string | undefined;
  prisma.session.findUnique = (async () => null) as typeof prisma.session.findUnique;
  prisma.session.delete = (async (args: { where: { id: string } }) => {
    deletedId = args.where.id;
    throw new Error("Record to delete does not exist.");
  }) as typeof prisma.session.delete;

  try {
    let target: string | null = null;
    try {
      await withSessionCookie(token, () => requireUser());
    } catch (error) {
      target = redirectTarget(error);
      if (!target) throw error;
    }
    assert.equal(target, "/api/auth/logout");

    const cleared = await GET(
      new Request(`${ORIGIN}/api/auth/logout`, {
        headers: { cookie: `${SESSION_COOKIE}=${token}`, host: "voiceops.test" },
      }),
    );
    assert.equal(cleared.status, 303);
    assert.equal(new URL(cleared.headers.get("location") || "", ORIGIN).pathname, "/login");
    assert.equal(deletedId, sid);

    const setCookie = cleared.headers.getSetCookie().find((value) => value.startsWith(`${SESSION_COOKIE}=`));
    assert.ok(setCookie);
    assert.match(setCookie, new RegExp(`^${SESSION_COOKIE}=;`));
    assert.match(setCookie, /Max-Age=0/i);

    const login = await proxy(request("/login"));
    assert.equal(login.headers.get("location"), null);
  } finally {
    prisma.session.findUnique = originalFind;
    prisma.session.delete = originalDelete;
  }
});
