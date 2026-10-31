import { NoAccess } from "@/components/no-access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleAdminEnabled } from "@/lib/marketing/config";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { assignUserRole } from "@/lib/marketing/role-actions";
import { ASSIGNABLE_ROLES } from "@/lib/marketing/roles";
import { roleLabel } from "@/lib/marketing/access";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (access.kind !== "super_admin") return <NoAccess title="Roles" />;
  if (!roleAdminEnabled()) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Roles</h1>
        <p className="mt-2 text-sm text-muted">Role assignment is turned off.</p>
      </div>
    );
  }
  const users = await prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true } });
  return (
    <div>
      <h1 className="text-2xl font-semibold">Roles</h1>
      <p className="mt-1 text-sm text-muted">Assign a role to someone who already signs in. This page does not create people.</p>
      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3">{row.email}</td>
                <td className="px-4 py-3">
                  <form action={assignUserRole} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="userId" value={row.id} />
                    <label className="sr-only" htmlFor={`role-${row.id}`}>Role for {row.name}</label>
                    <select id={`role-${row.id}`} name="role" defaultValue={row.role} className="h-11 rounded-lg border border-line bg-card px-2">
                      {ASSIGNABLE_ROLES.map((role) => (
                        <option key={role} value={role}>{roleLabel(role)}</option>
                      ))}
                    </select>
                    <button className="min-h-11 rounded-lg bg-brand px-4 font-semibold text-on-brand">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
