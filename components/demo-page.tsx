import { DemoScreens, type DemoScreenId } from "@/components/demo-screens";
import { buildDemoDataset } from "@/lib/demo/dataset";
import { demoView } from "@/lib/demo/access";
import { demoTourEnabled } from "@/lib/demo/flags";
import { presentDemo } from "@/lib/demo/present";
import { requireDemoVisitor } from "@/lib/demo/session";

export async function DemoPage({
  screen,
  searchParams,
}: {
  screen: DemoScreenId;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireDemoVisitor();
  const query = await searchParams;
  const data = presentDemo(buildDemoDataset(), demoView(query.view));
  return <DemoScreens screen={screen} data={data} tourEnabled={demoTourEnabled()} />;
}
