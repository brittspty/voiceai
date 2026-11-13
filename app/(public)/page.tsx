import { cookies } from "next/headers";
import { PublicHomepage } from "@/components/public-homepage";
import { homepageMetadata, homepageModel } from "@/lib/homepage-content";
import { readToken, SESSION_COOKIE } from "@/lib/session-token";

export async function generateMetadata() {
  return homepageMetadata();
}

export const dynamic = "force-dynamic";

export default async function PublicHomePage({ searchParams }: { searchParams: Promise<{ contact?: string }> }) {
  const [jar, query] = await Promise.all([cookies(), searchParams]);
  const payload = await readToken(jar.get(SESSION_COOKIE)?.value);
  const signedIn = payload?.kind === "session";
  const role = payload?.kind === "session" ? payload.role : null;
  const contact = query.contact === "saved" || query.contact === "invalid" ? query.contact : null;
  return <PublicHomepage model={homepageModel(process.env, { signedIn, role })} notice={contact} />;
}
