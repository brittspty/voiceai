import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { PRODUCT_NAME } from "@/lib/client-config";
import { loadBrand } from "@/lib/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export async function generateMetadata(): Promise<Metadata> {
  const brand = await loadBrand();
  return {
    title: PRODUCT_NAME,
    description: `Outbound voice AI operations for ${brand.companyName}.`,
    icons: brand.logoUrl ? { icon: brand.logoUrl } : undefined,
  };
}

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await loadBrand();
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} style={{ ["--brand" as string]: brand.brandColor }} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
