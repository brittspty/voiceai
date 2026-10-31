import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, readDemoCookie } from "./access";
import { demoAccessSecret, demoWorkspaceEnabled } from "./flags";

export async function readDemoSession() {
  if (!demoWorkspaceEnabled()) return null;
  const jar = await cookies();
  return readDemoCookie(jar.get(DEMO_COOKIE)?.value, demoAccessSecret());
}

export async function requireDemoVisitor() {
  if (!demoWorkspaceEnabled()) redirect("/demo/login");
  const session = await readDemoSession();
  if (!session) redirect("/demo/login");
  return session;
}
