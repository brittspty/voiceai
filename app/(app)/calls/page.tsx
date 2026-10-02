import { Suspense } from "react";
import { CallsExplorer } from "@/components/calls-explorer";
import { type SP } from "@/lib/params";
import { listCalls } from "@/lib/queries";

export default async function CallsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const data = await listCalls(await searchParams);
  return (
    <Suspense>
      <CallsExplorer rows={data.rows} total={data.total} page={data.page} perPage={data.perPage} offices={data.offices} />
    </Suspense>
  );
}
