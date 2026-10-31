/**
 * Specificity brand tokens. Placeholder values until the designer's file replaces this one.
 * Components read CSS variables that are generated from this object. Do not copy these values into components.
 */
export const brandTokens = {
  wordmark: "Specificity",
  tagline: "Identify. Engage. Convert.",
  logo: {
    src: "/brand/specificity-mark.png",
    full: "/brand/specificity-logo-full.png",
    reversed: "/brand/specificity-logo-reversed.png",
    mark: "S",
    alt: "Specificity Inc",
  },
  font: {
    /** Placeholder until official fonts are confirmed. */
    family: "Poppins",
    stack: "var(--font-brand), \"Segoe UI\", Arial, Helvetica, sans-serif",
    /** Data and the homepage feed. Headings stay on Poppins. */
    mono: "IBM Plex Mono",
    monoStack: "var(--font-plex-mono), \"IBM Plex Mono\", ui-monospace, monospace",
  },
  light: {
    canvas: "#F7F7F7",
    card: "#FFFFFF",
    line: "#E6E6E6",
    ink: "#231F20",
    muted: "#757575",
    sidebar: "#FFFFFF",
    hover: "#F7F7F7",
    chip: "#F7F7F7",
    /** Placeholder orange until the official hex is confirmed. */
    brand: "#FF5800",
    onBrand: "#231F20",
    onInk: "#ffffff",
    success: "#15803D",
    successStrong: "#15803D",
    successSoft: "#dcfce7",
    successBorder: "#15803D",
    warning: "#B45309",
    warningSoft: "#fef3c7",
    danger: "#B91C1C",
    dangerSoft: "#fee2e2",
    info: "#2B7BB9",
    infoSoft: "#e8f1ff",
    infoFill: "#dbeafe",
    brandInk: "#B33E00",
    chart1: "#2B7BB9",
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
    brand: "#FF5800",
    onBrand: "#231F20",
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
    brandInk: "#FF5800",
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
  brandInk: "--brand-ink",
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

/**
 * Dark Jarvis surfaces for the public login panel and the staff portfolio.
 * Values live here so components keep reading CSS variables.
 */
export const analyticsTheme = {
  brand: brandTokens.light.brand,
  ink: brandTokens.light.ink,
  bg: "#161314",
  bg2: "#1E1A1B",
  panel: "#231F20",
  line: "#3A3435",
  line2: "#2B2627",
  text: "#F4F1EF",
  text2: "#C9C3C0",
  text3: "#9C9592",
  ok: "#4ADE80",
  warn: "#FBBF24",
  bad: "#F87171",
  focus: "#7FB8E6",
  scale: "#14361f",
  learning: "#3a2f12",
  cut: "#3a1c1c",
  font: brandTokens.font.monoStack,
} as const;

/** Scoped theme for `.jarvis-dark`. Does not replace the app shell tokens. */
export function analyticsThemeCss() {
  const theme = analyticsTheme;
  return `.jarvis-dark {
  --brand: ${theme.brand};
  --on-brand: ${theme.ink};
  --canvas: ${theme.bg};
  --card: ${theme.panel};
  --line: ${theme.line};
  --ink: ${theme.text};
  --muted: ${theme.text3};
  --chip: ${theme.bg2};
  --hover: ${theme.bg2};
  --warning: ${theme.warn};
  --success: ${theme.ok};
  --danger: ${theme.bad};
  --info: ${theme.focus};
  background: ${theme.bg};
  color: ${theme.text};
  font-family: ${brandTokens.font.stack};
}
.jarvis-dark .num { font-family: ${theme.font}; font-variant-numeric: tabular-nums; }
.jarvis-dark .text-soft { color: ${theme.text2}; }
.jarvis-dark .chip-scale { background: ${theme.scale}; color: ${theme.ok}; }
.jarvis-dark .chip-learning { background: ${theme.learning}; color: ${theme.warn}; }
.jarvis-dark .chip-cut { background: ${theme.cut}; color: ${theme.bad}; }
.jarvis-dark :focus-visible { outline: 3px solid ${theme.focus}; outline-offset: 3px; }
.jarvis-dark .sticky-col { position: sticky; left: 0; background: ${theme.panel}; }`;
}
