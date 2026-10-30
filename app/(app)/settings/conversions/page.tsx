import type { Metadata } from "next";
import { ConversionFeedback } from "@/components/conversion-feedback";
import { PageTitle } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { denyAccess } from "@/lib/deny";
import { offlineConversionsEnabled } from "@/lib/marketing/config";
import { conversionAccess } from "@/lib/marketing/offline/access";
import { finalizeStoredDecisions, loadConversionFeedback } from "@/lib/marketing/offline/persist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Conversion feedback" };

export default async function ConversionFeedbackPage() {
  const user = await requireUser();
  const access = conversionAccess(user);
  if (!access.ok) denyAccess();
  if (offlineConversionsEnabled()) await finalizeStoredDecisions();
  const view = await loadConversionFeedback(access.seesValue);
  return (
    <div>
      <PageTitle
        title="Conversion feedback"
        subtitle="Settings · Connections. Booked and sold leads can go back to Meta and Google. Clients never see this page."
      />
      <ConversionFeedback view={view} canEdit={access.edit} reconnectMeta={access.reconnectMeta} reconnectGoogle={access.reconnectGoogle} />
    </div>
  );
}
