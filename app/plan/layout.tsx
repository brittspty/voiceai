import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Plan",
};

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
