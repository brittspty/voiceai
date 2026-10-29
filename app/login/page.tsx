import { LoginScreen } from "@/components/login-form";
import { loadBrand, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { clientConfig } from "@/lib/client-config";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const [brand, cfg] = await Promise.all([loadBrand(), Promise.resolve(clientConfig())]);
  const hint = cfg.showDemoLogin
    ? {
        ownerEmail: cfg.owner.email,
        ownerPassword: process.env.SEED_OWNER_PASSWORD?.trim() ? null : cfg.owner.password,
        adminEmail: cfg.admin.email,
      }
    : null;
  return (
    <LoginScreen
      brand={{ companyName: brand.companyName, brandColor: brand.brandColor, logoUrl: brand.logoUrl, mark: brand.mark, productName: PRODUCT_NAME, tagline: PRODUCT_TAGLINE }}
      hint={hint}
    />
  );
}
