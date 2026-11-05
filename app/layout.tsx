import type { Metadata } from "next";
import { headers } from "next/headers";
import { IBM_Plex_Mono, Poppins } from "next/font/google";
import { PostHogAnalytics } from "@/components/posthog-analytics";
import { ThemeProvider } from "@/components/theme-provider";
import { posthogClientProps } from "@/lib/analytics/posthog";
import { getCurrentUser } from "@/lib/auth";
import { BRAND_FONT, PRODUCT_NAME, PRODUCT_TAGLINE, PRODUCT_TITLE, PRODUCT_WORDMARK } from "@/lib/brand";
import { publicLogos } from "@/lib/brand/public";
import { brandTokenCss } from "@/lib/brand/tokens";
import "./globals.css";

const brandFont = Poppins({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-brand", display: "swap" });
const labelFont = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-label", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { default: PRODUCT_TITLE, template: `%s · ${PRODUCT_NAME}` },
    description: PRODUCT_TAGLINE,
    applicationName: PRODUCT_WORDMARK,
    manifest: "/site.webmanifest",
    openGraph: { title: PRODUCT_TITLE, description: PRODUCT_TAGLINE, siteName: PRODUCT_WORDMARK },
    twitter: { card: "summary", title: PRODUCT_TITLE, description: PRODUCT_TAGLINE },
    icons: {
      icon: [
        { url: publicLogos.favicon32, sizes: "32x32", type: "image/png" },
        { url: publicLogos.favicon192, sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: publicLogos.favicon192, sizes: "192x192" }],
    },
  };
}

export const dynamic = "force-dynamic";

async function analyticsProps() {
  try {
    const pathname = (await headers()).get("x-voiceops-path") || "";
    const user = await getCurrentUser();
    return posthogClientProps({
      pathname,
      role: user?.role ?? null,
      userId: user?.id ?? null,
      env: process.env,
    });
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const analytics = await analyticsProps();
  return (
    <html lang="en" className={`${brandFont.variable} ${labelFont.variable} ${plexMono.variable} h-full antialiased`} data-font={BRAND_FONT} suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <style dangerouslySetInnerHTML={{ __html: brandTokenCss() }} />
        {analytics ? <PostHogAnalytics apiKey={analytics.apiKey} userId={analytics.userId} role={analytics.role} /> : null}
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
