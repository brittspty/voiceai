import { NoAccess } from "@/components/no-access";
import { uxLaunchGapsEnabled } from "@/lib/ux-flags";

export default async function ForbiddenPage() {
  if (uxLaunchGapsEnabled()) return <NoAccess title="This page" />;
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-semibold">You have view-only access.</h1>
      <p className="mt-2 text-muted">This action is not available for your role.</p>
    </main>
  );
}
