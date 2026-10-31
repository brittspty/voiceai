import { dataChipLabel } from "@/lib/demo/chip";

export function DataChip({ demo = false, className = "" }: { demo?: boolean; className?: string }) {
  return <span className={`font-semibold text-ink ${className}`}>{dataChipLabel(demo ? "demo" : "product")}</span>;
}
