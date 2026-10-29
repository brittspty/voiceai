import { BRAND_TAGLINE, BRAND_WORDMARK } from "@/lib/brand";
import { RequestAccessForm } from "@/components/request-access-form";

export const metadata = { title: "Request access" };

export default function RequestAccessPage() {
  return <RequestAccessForm wordmark={BRAND_WORDMARK} tagline={BRAND_TAGLINE} />;
}
