import { BRAND_WORDMARK } from "@/lib/brand";
import { PUBLIC_TAGLINE } from "@/lib/brand/public";
import { RequestAccessForm } from "@/components/request-access-form";

export const metadata = { title: "Request access" };

export default function RequestAccessPage() {
  return <RequestAccessForm wordmark={BRAND_WORDMARK} tagline={PUBLIC_TAGLINE} />;
}
