import Link from "next/link";
import { TRY_DEMO_HREF } from "@/lib/demo/routes";

/** Reusable entry for the homepage. The route stays dark until DEMO_WORKSPACE is on. */
export function TryDemoButton({ className = "" }: { className?: string }) {
  return (
    <Link href={TRY_DEMO_HREF} className={`btn-brand inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm ${className}`}>
      Try the demo
    </Link>
  );
}
