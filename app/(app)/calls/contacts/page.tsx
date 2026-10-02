import { Suspense } from "react";
import { ContactsExplorer } from "@/components/other-explorers";
import { type SP } from "@/lib/params";
import { listContacts } from "@/lib/queries";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const data = await listContacts(await searchParams);
  return (
    <Suspense>
      <ContactsExplorer rows={data.rows} total={data.total} page={data.page} perPage={data.perPage} offices={data.offices} />
    </Suspense>
  );
}
