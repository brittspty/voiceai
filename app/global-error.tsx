"use client";

import { ErrorScreen } from "@/components/error-screen";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas font-sans text-ink">
        <ErrorScreen digest={error.digest} reset={reset} standalone />
      </body>
    </html>
  );
}
