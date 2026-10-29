import { MarketingView } from "@/components/marketing-view";
import { getMarketingPage } from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const data = await getMarketingPage();
  return <MarketingView {...data} />;
}
