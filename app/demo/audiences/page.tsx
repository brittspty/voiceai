import { DemoPage } from "@/components/demo-page";

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <DemoPage screen="audiences" searchParams={searchParams} />;
}
