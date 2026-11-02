import Link from "next/link";
import { accessPageKey, canRequestPageAccess } from "@/lib/access-request";
import { requestPageAccess } from "@/lib/access-request-actions";
import { pageAccessAlreadySent } from "@/lib/access-request-store";
import { getCurrentUser } from "@/lib/auth";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";

function accessRoleLabel(role: string) {
  const labels: Record<string, string> = {
    super_admin: "Super admin",
    admin: "Staff admin",
    account_manager: "Employee (assigned clients)",
    all_clients_viewer: "Employee (all clients)",
    viewer: "Employee (all clients)",
    owner: "Client",
    client_viewer: "Client viewer",
    demo_viewer: "Demo viewer",
  };
  return labels[role] || "Employee";
}

export async function NoAccess({ title }: { title: string }) {
  if (!uxLaunchGapsEnabled()) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">You don&apos;t have access to this page.</p>
      </div>
    );
  }
  const user = await getCurrentUser();
  const pageKey = accessPageKey(title);
  const role = user?.role || "";
  const mayRequest = Boolean(pageKey) && canRequestPageAccess(role);
  const sent = user && pageKey && mayRequest ? await pageAccessAlreadySent(user.id, pageKey) : false;
  return (
    <section className="max-w-xl rounded-xl border border-line bg-card p-6" aria-labelledby="no-access-title">
      <h1 id="no-access-title" className="text-2xl font-semibold">You don&apos;t have access to {title} yet</h1>
      <p className="mt-2 text-sm">Your role, <strong>{accessRoleLabel(role)}</strong>, doesn&apos;t include this page. An admin can add it.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {mayRequest && sent ? (
          <button type="button" className="btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm" disabled>
            Request sent
          </button>
        ) : null}
        {mayRequest && !sent ? (
          <form action={requestPageAccess}>
            <input type="hidden" name="pageKey" value={pageKey || ""} />
            <button className="btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm" type="submit">
              Request access
            </button>
          </form>
        ) : null}
        {!mayRequest ? <p className="text-sm">Ask your Specificity team.</p> : null}
        <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">
          Back to home
        </Link>
      </div>
      {mayRequest ? (
        <p className="mt-3 text-sm text-muted">
          {sent
            ? "We let your Specificity admins know. You’ll see a note here when access changes."
            : "After you request, we let your Specificity admins know. You’ll see a note here when access changes."}
        </p>
      ) : null}
    </section>
  );
}
