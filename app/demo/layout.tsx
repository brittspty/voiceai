import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoFrame } from "@/components/demo-frame";
import { DemoTourExit, DemoTourPanel } from "@/components/demo-tour";
import { PRODUCT_WORDMARK } from "@/lib/brand";
import { DEMO_FACTS } from "@/lib/demo/dataset";
import { demoTourEnabled, demoWorkspaceEnabled } from "@/lib/demo/flags";
import { DEMO_SUPPORTING_LINE, DEMO_TAGLINE, tourCatalog } from "@/lib/demo/tour";

const demoDescription = `${DEMO_TAGLINE} ${DEMO_SUPPORTING_LINE}`;

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: `${PRODUCT_WORDMARK} demo`,
  description: demoDescription,
  openGraph: { title: `${PRODUCT_WORDMARK} demo`, description: demoDescription, siteName: PRODUCT_WORDMARK },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  if (!demoWorkspaceEnabled()) notFound();
  const catalog = tourCatalog(DEMO_FACTS);
  const enabled = demoTourEnabled();
  return (
    <DemoFrame exit={<Suspense fallback={null}><DemoTourExit enabled={enabled} catalog={catalog} /></Suspense>}>
      <Suspense fallback={null}>
        <DemoTourPanel enabled={enabled} catalog={catalog} />
      </Suspense>
      {children}
    </DemoFrame>
  );
}
