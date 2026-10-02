import { AppShell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { getOrg } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, org] = await Promise.all([requireUser(), getOrg()]);
  return (
    <AppShell org={{ name: org.name, subtitle: org.subtitle }} user={user}>
      {children}
    </AppShell>
  );
}
