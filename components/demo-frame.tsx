import { brandTokens } from "@/lib/brand/tokens";
import { DataChip } from "@/components/data-chip";

const stripe = `
.demo-frame{min-height:100vh;box-shadow:inset 0 0 0 4px ${brandTokens.light.brand};background:${brandTokens.light.canvas};color:${brandTokens.light.ink}}
.demo-stripe{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 16px;padding-top:max(10px, env(safe-area-inset-top));background:repeating-linear-gradient(-45deg, ${brandTokens.light.brand}, ${brandTokens.light.brand} 12px, ${brandTokens.light.ink} 12px, ${brandTokens.light.ink} 24px);color:${brandTokens.light.onInk}}
.demo-word{background:${brandTokens.light.ink};color:${brandTokens.light.onInk};padding:4px 10px;letter-spacing:.18em;font-weight:700}
`;

export function DemoFrame({ children, exit }: { children: React.ReactNode; exit?: React.ReactNode }) {
  return (
    <div className="demo-frame">
      <style dangerouslySetInnerHTML={{ __html: stripe }} />
      <div className="demo-stripe" role="status" aria-label="Demo">
        <span className="demo-word">DEMO</span>
        {exit}
      </div>
      <div className="border-b border-line bg-card px-4 py-2">
        <DataChip demo />
      </div>
      {children}
    </div>
  );
}
