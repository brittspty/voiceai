/**
 * Specificity brand tokens. Placeholder values until the designer's file replaces this one.
 * Components read CSS variables that are generated from this object. Do not copy these values into components.
 */
export const brandTokens = {
  wordmark: "Specificity",
  tagline: "Identify. Engage. Convert.",
  logo: {
    src: "",
    mark: "S",
  },
  font: {
    family: "Inter",
    stack: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  },
  light: {
    canvas: "#f4f4f5",
    card: "#ffffff",
    line: "#e6e6ea",
    ink: "#1c1c1f",
    muted: "#71717a",
    sidebar: "#f7f7f8",
    hover: "#ececef",
    chip: "#f3f3f5",
    brand: "#2563eb",
    onBrand: "#ffffff",
    onInk: "#ffffff",
    success: "#187a42",
    successStrong: "#22a06b",
    successSoft: "#e7f6ee",
    successBorder: "#8dcea8",
    warning: "#9a6708",
    warningSoft: "#f8f1df",
    danger: "#d14343",
    dangerSoft: "#fdecec",
    info: "#1d4ed8",
    infoSoft: "#e8f1ff",
    infoFill: "#dbeafe",
    chart1: "#3b82f6",
    chart2: "#2eb8a0",
    chart2Soft: "#7dd3c7",
    overlay: "rgba(0, 0, 0, 0.3)",
    hatch: "#f3f4f6",
    hatchLine: "rgba(24, 24, 27, 0.045)",
    shadow: "0 1px 2px rgba(16, 16, 20, 0.04)",
  },
  dark: {
    canvas: "#101012",
    card: "#18181b",
    line: "#2a2a30",
    ink: "#f4f4f5",
    muted: "#a1a1aa",
    sidebar: "#141416",
    hover: "#232328",
    chip: "#232328",
    brand: "#2563eb",
    onBrand: "#ffffff",
    onInk: "#101012",
    success: "#8dcea8",
    successStrong: "#22a06b",
    successSoft: "#143024",
    successBorder: "#1f6b45",
    warning: "#e6c37a",
    warningSoft: "#3a2e12",
    danger: "#f0a0a0",
    dangerSoft: "#3a1717",
    info: "#9db7f5",
    infoSoft: "#1a2744",
    infoFill: "#1a2744",
    chart1: "#3b82f6",
    chart2: "#2eb8a0",
    chart2Soft: "#7dd3c7",
    overlay: "rgba(0, 0, 0, 0.5)",
    hatch: "#141416",
    hatchLine: "rgba(255, 255, 255, 0.04)",
    shadow: "none",
  },
} as const;

export type BrandTokens = typeof brandTokens;

const VAR_NAMES: Record<keyof typeof brandTokens.light, string> = {
  canvas: "--canvas",
  card: "--card",
  line: "--line",
  ink: "--ink",
  muted: "--muted",
  sidebar: "--sidebar",
  hover: "--hover",
  chip: "--chip",
  brand: "--brand",
  onBrand: "--on-brand",
  onInk: "--on-ink",
  success: "--success",
  successStrong: "--success-strong",
  successSoft: "--success-soft",
  successBorder: "--success-border",
  warning: "--warning",
  warningSoft: "--warning-soft",
  danger: "--danger",
  dangerSoft: "--danger-soft",
  info: "--info",
  infoSoft: "--info-soft",
  infoFill: "--info-fill",
  chart1: "--chart-1",
  chart2: "--chart-2",
  chart2Soft: "--chart-2-soft",
  overlay: "--overlay",
  hatch: "--hatch",
  hatchLine: "--hatch-line",
  shadow: "--shadow",
};

function block(selector: string, values: { [K in keyof typeof brandTokens.light]: string }) {
  const lines = Object.entries(values).map(([key, value]) => `  ${VAR_NAMES[key as keyof typeof values]}: ${value};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

/** CSS custom properties for the root layout. Values come only from `brandTokens`. */
export function brandTokenCss() {
  const font = `:root {\n  --font-sans: ${brandTokens.font.stack};\n}`;
  return `${block(":root", brandTokens.light)}\n${block(".dark", brandTokens.dark)}\n${font}`;
}
