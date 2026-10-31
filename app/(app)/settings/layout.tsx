import { redirect } from "next/navigation";
import { SettingsNav } from "@/components/settings-nav";
import { requireUser } from "@/lib/auth";
import { demoWorkspaceEnabled } from "@/lib/demo/flags";
import { jarvisUiV2Enabled, roleAdminEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { clientPlansEnabled } from "@/lib/plans/flags";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role === "all_clients_viewer") redirect("/");
  if (jarvisUiV2Enabled()) return children;
  const access = await loadMarketingAccess(user);
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <SettingsNav role={user.role} email={user.email} userId={user.id} showRoles={roleAdminEnabled() && access.kind === "super_admin"} showDemo={demoWorkspaceEnabled()} showPlans={clientPlansEnabled()} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
