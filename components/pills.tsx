import { cn } from "@/lib/cn";
import { maskPhone } from "@/lib/phone";
import { formatDuration, formatMoney, outcomeLabel, outcomeTone, statusLabel, statusTone } from "@/lib/format";

const tones = {
  green: "bg-[#e7f6ee] text-[#187a42]",
  amber: "bg-[#f8f1df] text-[#9a6708]",
  red: "bg-[#fdecec] text-[#d14343]",
  blue: "bg-[#e8f1ff] text-[#1d4ed8]",
  gray: "bg-chip text-muted",
};

export function Pill({ children, tone = "gray" }: { children: React.ReactNode; tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function OutcomePill({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-muted">—</span>;
  return <Pill tone={outcomeTone(outcome)}>{outcomeLabel(outcome)}</Pill>;
}

export function StatusPill({ status }: { status: string }) {
  return <Pill tone={statusTone(status)}>{statusLabel(status)}</Pill>;
}

export function ConsentPill({ consent }: { consent: string }) {
  if (!consent || consent === "none") return <span className="text-muted">—</span>;
  const tone = consent === "high" ? "green" : consent === "medium" ? "blue" : "amber";
  return <Pill tone={tone}>{consent[0].toUpperCase() + consent.slice(1)}</Pill>;
}

export function ContactLines({ name, phone, direction }: { name: string; phone: string; direction?: string }) {
  return (
    <div className="min-w-[180px]">
      <div className="font-medium text-ink">{name}</div>
      <div className="text-xs text-muted">
        {maskPhone(phone)}
        {direction === "inbound" ? " · Called in" : ""}
      </div>
    </div>
  );
}

export function Duration({ seconds }: { seconds: number }) {
  return <span className="tabular-nums text-sm">{formatDuration(seconds)}</span>;
}

export function Money({ cents }: { cents: number }) {
  return <span className="tabular-nums text-sm">{formatMoney(cents)}</span>;
}
