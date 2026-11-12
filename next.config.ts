import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The executive summary is a static directory page. Its relative links need the trailing slash.
  skipTrailingSlashRedirect: true,
  serverExternalPackages: ["bcryptjs", "ioredis", "@prisma/client", "prisma", "qrcode"],
  experimental: { authInterrupts: true },
  async headers() {
    const share = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [
      { source: "/share/:path*", headers: share },
      { source: "/api/share/:path*", headers: share },
      { source: "/demo", headers: share },
      { source: "/demo/:path*", headers: share },
      { source: "/plan/:path*", headers: share },
    ];
  },
};

export default nextConfig;
