import { PublicPage } from "@/components/public-page";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata = { title: "Support" };

export default function ContactPage() {
  return (
    <PublicPage title="Support">
      <p>Email support@specificityinc.com from the address you use to sign in. We reply within 1 business day.</p>
      <p>New to {PRODUCT_NAME}? Request access and we will set you up within 1 business day. Include your name, work email, and business name.</p>
      <p><a className="font-medium underline" href={`mailto:support@specificityinc.com?subject=${encodeURIComponent(`${PRODUCT_NAME} access`)}`}>Request access</a></p>
    </PublicPage>
  );
}
