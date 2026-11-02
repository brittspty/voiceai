import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoFrame } from "@/components/demo-frame";
import { DemoTourExit, DemoTourPanel } from "@/components/demo-tour";
import { DEMO_FACTS } from "@/lib/demo/dataset";
import { demoTourEnabled, demoWorkspaceEnabled } from "@/lib/demo/flags";
import { demoTakingABreak } from "@/lib/ux-flags";
import { renderTourSteps } from "@/lib/demo/tour";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Demo",
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  if (!demoWorkspaceEnabled()) {
    if (demoTakingABreak()) {
      return (
        <main className="grid min-h-screen place-items-center bg-canvas px-4">
          <div className="max-w-lg text-center">
            <h1 className="text-3xl font-semibold">The demo is taking a break</h1>
            <p className="mt-3 text-sm">The demo isn&apos;t available right now. You can still talk to us and see Diver AI live.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href="/request-access" className="btn-brand inline-flex min-h-11 items-center rounded-full px-5 text-sm">Request a demo</Link>
              <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm">Go to homepage</Link>
            </div>
          </div>
        </main>
      );
    }
    notFound();
  }
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
