import { redirect } from "next/navigation";
import { PortfolioDashboard } from "@/components/portfolio-dashboard";
import { getCurrentUser } from "@/lib/auth";
import { loginAnalyticsEnabled } from "@/lib/login-analytics";
import { loadMarketingAccess } from "@/lib/marketing/queries";
import { portfolioAllowed } from "@/lib/portfolio";
import { loadPortfolioModel } from "@/lib/portfolio-query";
import { postLoginPath } from "@/lib/public-routing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  if (!loginAnalyticsEnabled()) redirect(postLoginPath(null));
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = await loadMarketingAccess(user);
  if (!portfolioAllowed(access.kind)) redirect(postLoginPath(user.role));
  const model = await loadPortfolioModel(access);
  if (!model) redirect(postLoginPath(user.role));
  return <PortfolioDashboard initial={model} />;
}
