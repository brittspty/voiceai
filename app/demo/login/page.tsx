import { redirect } from "next/navigation";
import { PRODUCT_WORDMARK } from "@/lib/brand";
import { readDemoSession } from "@/lib/demo/session";

export default async function DemoLoginPage() {
  if (await readDemoSession()) redirect("/demo");
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{PRODUCT_WORDMARK} demo</h1>
      <p className="mt-2 text-sm leading-6 text-muted">Read only. Enter with a signed demo link or the demo access secret. The secret is not stored in the app.</p>
      <form className="mt-6 space-y-3" method="post" action="/api/demo/login">
        <label className="block text-sm font-medium">
          Demo access secret
          <input name="secret" type="password" autoComplete="off" required className="mt-1 h-11 w-full rounded-lg border border-line bg-card px-3" />
        </label>
        <button className="btn-brand inline-flex min-h-11 items-center rounded-full px-5 text-sm" type="submit">
          Enter the demo
        </button>
      </form>
    </main>
  );
}
