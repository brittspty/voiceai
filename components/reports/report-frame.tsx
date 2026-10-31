import { IBM_Plex_Mono } from "next/font/google";
import "./report.css";

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-report-mono",
  display: "swap",
});

export function ReportFrame({ children, tone = "dark" }: { children: React.ReactNode; tone?: "dark" | "light" }) {
  return <div className={`${mono.variable} ${tone === "light" ? "jr-print-root" : "jr-root"}`}>{children}</div>;
}
