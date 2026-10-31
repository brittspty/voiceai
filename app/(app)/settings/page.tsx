import { redirect } from "next/navigation";
import { jarvisUiV2Enabled } from "@/lib/marketing/config";

export default function SettingsIndex() {
  redirect(jarvisUiV2Enabled() ? "/settings/connections" : "/settings/calling");
}
