import { cookies } from "next/headers";
import { CallsTabs } from "@/components/calls-tabs";
import { PageTitle } from "@/components/shell";
import { AIS2L_LINE, AIS2L_NAME } from "@/lib/brand/names";
import { TestModeStrip } from "@/components/test-mode-strip";
import { getOrg } from "@/lib/queries";
import { TEST_STRIP_COOKIE } from "@/lib/ui-prefs";

export const metadata = { title: AIS2L_NAME };

export default async function CallsLayout({ children }: { children: React.ReactNode }) {
  const [org, jar] = await Promise.all([getOrg(), cookies()]);
  return (
    <div>
      <PageTitle title={AIS2L_NAME} subtitle={`${AIS2L_LINE}. What Avery did, who was called, and the numbers Avery will never dial.`} />
      <TestModeStrip show={org.testMode && jar.get(TEST_STRIP_COOKIE)?.value !== "1"} />
      <CallsTabs />
      {children}
    </div>
  );
}
