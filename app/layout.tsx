import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { BRAND_FONT, loadBrand, PRODUCT_TAGLINE, PRODUCT_TITLE } from "@/lib/brand";
import { brandTokenCss } from "@/lib/brand/tokens";
import "./globals.css";

const brandFont = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-brand", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const brand = await loadBrand();
  return {
    title: { default: PRODUCT_TITLE, template: "%s · VoiceOps" },
    description: PRODUCT_TAGLINE,
    icons: brand.logoUrl ? { icon: brand.logoUrl } : undefined,
  };
}

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await loadBrand();
  return (
    <html lang="en" className={`${brandFont.variable} h-full antialiased`} data-font={BRAND_FONT} style={{ ["--brand" as string]: brand.brandColor }} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <style dangerouslySetInnerHTML={{ __html: brandTokenCss() }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
