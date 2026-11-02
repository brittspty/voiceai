import type { Metadata } from "next";
import { IBM_Plex_Mono, Poppins } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { BRAND_FONT, loadBrand, PRODUCT_NAME, PRODUCT_TAGLINE, PRODUCT_TITLE, PRODUCT_WORDMARK } from "@/lib/brand";
import { brandHeadIcons } from "@/lib/brand/logo";
import { brandTokenCss } from "@/lib/brand/tokens";
import "./globals.css";

const brandFont = Poppins({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-brand", display: "swap" });
const labelFont = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-label", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const brand = await loadBrand();
  const v2 = brandHeadIcons();
  return {
    title: { default: PRODUCT_TITLE, template: `%s · ${PRODUCT_NAME}` },
    description: PRODUCT_TAGLINE,
    applicationName: PRODUCT_WORDMARK,
    manifest: v2 ? v2.manifest : "/site.webmanifest",
    openGraph: { title: PRODUCT_TITLE, description: PRODUCT_TAGLINE, siteName: PRODUCT_WORDMARK },
    twitter: { card: "summary", title: PRODUCT_TITLE, description: PRODUCT_TAGLINE },
    icons: v2 ? v2.icons : brand.logoUrl ? { icon: brand.logoUrl } : undefined,
  };
}

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${brandFont.variable} ${labelFont.variable} ${plexMono.variable} h-full antialiased`} data-font={BRAND_FONT} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <style dangerouslySetInnerHTML={{ __html: brandTokenCss() }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
