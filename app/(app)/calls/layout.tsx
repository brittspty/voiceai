import { CallsTabs } from "@/components/calls-tabs";
import { PageTitle } from "@/components/shell";
import { TestModeStrip } from "@/components/test-mode-strip";
import { getOrg } from "@/lib/queries";

export const metadata = { title: "Calls" };

export default async function CallsLayout({ children }: { children: React.ReactNode }) {
  const org = await getOrg();
  return (
    <div>
      <PageTitle title="Calls" subtitle="What Avery did, who was called, and the numbers Avery will never dial." />
      <TestModeStrip show={org.testMode} />
      <CallsTabs />
      {children}
    </div>
  );
}
