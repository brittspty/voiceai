import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs", "ioredis", "@prisma/client", "prisma", "qrcode"],
};

export default nextConfig;
