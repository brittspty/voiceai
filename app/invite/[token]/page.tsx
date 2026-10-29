import { BRAND_WORDMARK } from "@/lib/brand";
import { AcceptInviteForm } from "@/components/accept-invite-form";

export const metadata = { title: "Join" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInviteForm token={token} wordmark={BRAND_WORDMARK} />;
}
