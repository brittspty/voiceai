"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { brandTokens } from "@/lib/brand/tokens";

export function ErrorScreen({
  digest,
  reset,
  standalone = false,
}: {
  digest?: string;
  reset: () => void;
  standalone?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div className={standalone ? "grid min-h-screen place-items-center bg-canvas px-4" : ""} role="alert">
      <div className="max-w-xl rounded-xl border border-line bg-card p-6">
        {standalone ? <Image src={brandTokens.logo.reversed} alt="Specificity" width={142} height={50} /> : null}
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">
          This page didn&apos;t load
        </h1>
        <p className="mt-2 text-sm">Something went wrong on our side. Your data is safe. Try again, or go back to home.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm">
            Go to home
          </Link>
        </div>
        {digest ? (
          <p className="mt-4 font-mono text-xs text-muted">Reference: {digest} · share this with your Specificity admin</p>
        ) : null}
      </div>
    </div>
  );
}
