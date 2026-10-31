import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoFrame } from "@/components/demo-frame";
import { DemoTourExit, DemoTourPanel } from "@/components/demo-tour";
import { DEMO_FACTS } from "@/lib/demo/dataset";
import { demoTourEnabled, demoWorkspaceEnabled } from "@/lib/demo/flags";
import { renderTourSteps } from "@/lib/demo/tour";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Demo",
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  if (!demoWorkspaceEnabled()) notFound();
  const steps = renderTourSteps(DEMO_FACTS);
  const enabled = demoTourEnabled();
  return (
    <DemoFrame exit={<Suspense fallback={null}><DemoTourExit enabled={enabled} steps={steps} /></Suspense>}>
      <Suspense fallback={null}>
        <DemoTourPanel enabled={enabled} steps={steps} />
      </Suspense>
      {children}
    </DemoFrame>
  );
}
