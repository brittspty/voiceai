import { PRODUCT_NAME } from "@/lib/brand";
import { PublicPage } from "@/components/public-page";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <PublicPage title="Privacy">
      <p>{PRODUCT_NAME} places calls for service businesses and stores the lead name, phone number, consent, call notes, and outcome so you can see what happened.</p>
      <p>Call recordings and notes stay in your workspace. Specificity staff can see them only to support your account. We do not sell lead lists.</p>
      <p>To ask for a copy of your data or to delete a lead, email support@specificityinc.com. Your signed agreement with Specificity is the full policy. This page is a plain-language summary.</p>
    </PublicPage>
  );
}
