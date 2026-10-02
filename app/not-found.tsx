import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas text-center">
      <div>
        <h1 className="text-2xl font-semibold">That page is not in Voice Operations</h1>
        <Link href="/" className="mt-3 inline-block text-sm underline">Back to Overview</Link>
      </div>
    </div>
  );
}
