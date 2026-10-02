import { Suspense } from "react";
import { DncExplorer } from "@/components/other-explorers";
import { type SP } from "@/lib/params";
import { listDnc } from "@/lib/queries";

export default async function DncPage({ searchParams }: { searchParams: Promise<SP> }) {
  const data = await listDnc(await searchParams);
  return (
    <Suspense>
      <DncExplorer rows={data.rows} total={data.total} page={data.page} perPage={data.perPage} />
    </Suspense>
  );
}
