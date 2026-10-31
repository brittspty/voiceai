import { PublicPage } from "@/components/public-page";
import { AIS2L_NAME } from "@/lib/brand";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <PublicPage title="Terms">
      <p>{AIS2L_NAME} calls leads only when your calling rules say it is allowed: consent on file, not on a do-not-call list, and inside local calling hours.</p>
      <p>You are responsible for the leads you import and for keeping test mode on until you mean to call real people. Going live asks you to type GO LIVE.</p>
      <p>The signed agreement with Specificity Inc controls billing, uptime, and liability. This page tells you how the product behaves. Questions go to support@specificityinc.com.</p>
    </PublicPage>
  );
}
