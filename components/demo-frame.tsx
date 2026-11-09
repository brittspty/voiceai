import { brandTokens } from "@/lib/brand/tokens";
import { DataChip } from "@/components/data-chip";
import { ProductLockup } from "@/components/product-lockup";
import { DEMO_SUPPORTING_LINE } from "@/lib/demo/tour";

const stripe = `
.demo-frame{min-height:100vh;box-shadow:inset 0 0 0 4px ${brandTokens.light.brand};background:${brandTokens.light.canvas};color:${brandTokens.light.ink}}
.demo-stripe{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 16px;padding-top:max(8px, env(safe-area-inset-top));background:${brandTokens.light.ink};color:${brandTokens.light.onInk};border-bottom:4px solid ${brandTokens.light.brand}}
.demo-word{background:${brandTokens.light.brand};color:${brandTokens.light.onBrand};padding:4px 10px;letter-spacing:.18em;font-weight:700}
.demo-tag{color:${brandTokens.light.onInk};font-weight:600;font-size:14px}
`;

export function DemoFrame({ children, exit }: { children: React.ReactNode; exit?: React.ReactNode }) {
  return (
    <div className="demo-frame">
      <style dangerouslySetInnerHTML={{ __html: stripe }} />
      <div className="demo-stripe" role="status" aria-label="Demo">
        <span className="demo-word">DEMO</span>
        <ProductLockup surface="dark" size="header" />
        <span className="demo-tag">{DEMO_SUPPORTING_LINE}</span>
        {exit}
      </div>
      <div className="border-b border-line bg-card px-4 py-2">
        <DataChip demo />
      </div>
      {children}
    </div>
  );
}
