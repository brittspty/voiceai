import { headers } from "next/headers";
import { SignedInShell } from "@/components/signed-in-shell";
import { requireUser } from "@/lib/auth";
import { getOrg } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, org] = await Promise.all([requireUser(), getOrg()]);
  const path = (await headers()).get("x-voiceops-path") || "";
  return (
    <SignedInShell user={user} org={org} path={path}>
      {children}
    </SignedInShell>
  );
}
