import { notFound } from "next/navigation";
import { EnterpriseDashboard } from "../../../../ui/enterprise-dashboard";

export default async function Page({ searchParams }: { searchParams: Promise<{ designed?: string }> }) {
  if ((await searchParams).designed !== "1") notFound();
  return <EnterpriseDashboard designed />;
}
