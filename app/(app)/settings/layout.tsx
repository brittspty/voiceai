import { SettingsNav } from "@/components/settings-nav";
import { requireUser } from "@/lib/auth";
import { demoWorkspaceEnabled } from "@/lib/demo/flags";
import { clientPlansEnabled } from "@/lib/plans/flags";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <SettingsNav role={user.role} email={user.email} userId={user.id} showDemo={demoWorkspaceEnabled()} showPlans={clientPlansEnabled()} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
