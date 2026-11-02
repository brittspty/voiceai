import { BrandFooter, BrandLockup } from "@/components/brand-lockup";

export function ShareChrome({ children }: { children: React.ReactNode }) {
  return (
    <main>
      <header className="flex items-center gap-3 border-b-[3px] border-brand bg-card px-4 py-3">
        <BrandLockup />
      </header>
      {children}
      <BrandFooter />
    </main>
  );
}
