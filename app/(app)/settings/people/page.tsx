import { notFound } from "next/navigation";
import { NoAccess } from "@/components/no-access";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { userAdminEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { roleLabel } from "@/lib/marketing/access";
import { assignAccountManager, createClientViewerLogin, deleteUserAccount, setUserDisabled } from "@/lib/user-admin-actions";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  if (!userAdminEnabled()) notFound();
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin" && access.kind !== "account_manager") return <NoAccess title="People" />;
  const [users, workspaces, mine] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, disabledAt: true, clientAccess: { select: { workspaceId: true } } },
    }),
    prisma.workspace.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.marketingAssignment.findMany({ where: { userId: user.id, scopeKind: "client" }, select: { workspaceId: true } }),
  ]);
  const assigned = new Set(mine.map((row) => row.workspaceId));
  const clientChoices = access.kind === "super_admin" ? workspaces : workspaces.filter((row) => assigned.has(row.id));
  const managers = users.filter((row) => row.role === "account_manager" && !row.disabledAt);
  return (
    <div>
      <PageTitle title="People" subtitle="Assign account managers, add a client viewer for one client, or turn an account off. Turning an account off signs that person out. Nothing here is a hard delete unless you are a super admin and you type the email." />
      {access.kind === "super_admin" && (
        <form action={assignAccountManager} className="mb-6 grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-3">
          <h2 className="text-sm font-medium sm:col-span-3">Assign an account manager</h2>
          <label className="text-sm">Account manager
            <select name="managerId" className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-2" required>
              <option value="">Choose</option>
              {managers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Client
            <select name="workspaceId" className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-2" required>
              <option value="">Choose</option>
              {workspaces.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <div className="flex items-end"><button className="btn-brand h-10 rounded-full px-4 text-sm">Assign</button></div>
        </form>
      )}
      <form action={createClientViewerLogin} className="mb-6 grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-2">
        <h2 className="text-sm font-medium sm:col-span-2">Client viewer for one client</h2>
        <p className="text-sm text-muted sm:col-span-2">This login can see only that client, and it cannot see spend, cost, budget, or bids. An account manager cannot create a super admin.</p>
        <label className="text-sm">Name<input name="name" required className="mt-1 h-10 w-full rounded-lg border border-line px-3" /></label>
        <label className="text-sm">Work email<input name="email" type="email" required className="mt-1 h-10 w-full rounded-lg border border-line px-3" /></label>
        <label className="text-sm">Password<input name="password" type="password" required autoComplete="new-password" className="mt-1 h-10 w-full rounded-lg border border-line px-3" /></label>
        <label className="text-sm">Client
          <select name="workspaceId" className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-2" required>
            <option value="">Choose</option>
            {clientChoices.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <div className="sm:col-span-2"><button className="btn-brand h-10 rounded-full px-4 text-sm">Create login</button></div>
      </form>
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] text-muted">
              {["Name", "Email", "Role", "Status", "Actions"].map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {users.map((row) => {
              const own = row.id === user.id;
              const amCanToggle = access.kind === "account_manager" && row.role === "client_viewer" && row.clientAccess && assigned.has(row.clientAccess.workspaceId);
              const canToggle = !own && (access.kind === "super_admin" || amCanToggle);
              return (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">{roleLabel(row.role)}</td>
                  <td className="px-4 py-3">{row.disabledAt ? "Off" : "On"}</td>
                  <td className="px-4 py-3">
                    {canToggle && (
                      <form action={setUserDisabled} className="mb-2">
                        <input type="hidden" name="userId" value={row.id} />
                        <input type="hidden" name="disabled" value={row.disabledAt ? "0" : "1"} />
                        <button className="underline">{row.disabledAt ? "Turn on" : "Turn off"}</button>
                      </form>
                    )}
                    {access.kind === "super_admin" && !own && (
                      <form action={deleteUserAccount} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="userId" value={row.id} />
                        <label className="text-xs text-muted">Type email to delete
                          <input name="confirm" className="mt-1 block h-9 rounded-lg border border-line px-2" autoComplete="off" />
                        </label>
                        <button className="text-sm text-danger underline">Delete</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
