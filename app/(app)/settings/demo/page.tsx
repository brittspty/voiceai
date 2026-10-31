import { notFound } from "next/navigation";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import { mintDemoLink, resetDemo } from "@/lib/demo/actions";
import { demoWorkspaceEnabled } from "@/lib/demo/flags";

export default async function DemoSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!demoWorkspaceEnabled()) notFound();
  const user = await requireUser();
  if (user.role !== "super_admin" && user.role !== "owner") denyAccess();
  const link = (await searchParams).link;
  const shown = typeof link === "string" ? link : "";
  return (
    <div>
      <PageTitle title="Demo workspace" subtitle="Fictional clients only. Reset replaces the demo tenant and leaves real workspaces alone." />
      {shown ? <p className="mb-4 break-all rounded-xl border border-line bg-card px-4 py-3 text-sm">Signed link: {shown}</p> : null}
      <form action={mintDemoLink} className="mb-6 flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium">Label
          <input name="label" className="mt-1 block h-11 rounded-lg border border-line bg-card px-3" placeholder="Prospect" />
        </label>
        <label className="text-sm font-medium">Days
          <input name="days" type="number" min={1} max={90} defaultValue={14} className="mt-1 block h-11 w-24 rounded-lg border border-line bg-card px-3" />
        </label>
        <button className="btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm" type="submit">Create signed link</button>
      </form>
      <form action={resetDemo}>
        <button className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold" type="submit">Reset demo</button>
      </form>
    </div>
  );
}
