import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { clientLinksEnabled } from "@/lib/marketing/config";
import { revokeShareLink } from "@/lib/marketing/human-actions";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ShareLinksPage() {
  const user = await requireUser();
  const access = await loadMarketingAccess(user);
  if (user.role === "client_viewer") redirect("/marketing/client");
  if (!clientLinksEnabled() || !access.canCreateShareLink) redirect("/marketing");
  const links = await prisma.clientShareLink.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return (
    <div>
      <h1 className="text-2xl font-semibold">Shared links</h1>
      <p className="mt-1 text-sm text-muted">Revoking a link stops it immediately. New links expire in 30 days unless you pick another date.</p>
      <div className="mt-4 space-y-3">
        {links.map((link) => (
          <article key={link.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-4">
            <div>
              <div className="font-medium">{link.label || "Client link"}</div>
              <p className="text-sm text-muted">
                {link.revokedAt ? "Revoked" : link.expiresAt ? `Expires ${link.expiresAt.toISOString().slice(0, 10)}` : "No expiry"}
                {link.passcodeHash ? " · Passcode on" : ""}
              </p>
            </div>
            {!link.revokedAt && (
              <form action={async () => { "use server"; await revokeShareLink(link.id); }}>
                <button className="min-h-11 rounded-lg border border-line px-4">Revoke</button>
              </form>
            )}
          </article>
        ))}
        {!links.length && <p className="text-sm text-muted">No links yet.</p>}
      </div>
    </div>
  );
}
