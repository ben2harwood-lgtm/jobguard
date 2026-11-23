import { notFound } from "next/navigation";
import { EnterpriseStatement } from "../../../../ui/enterprise-statement";

export default async function Page({ searchParams }: { searchParams: Promise<{ designed?: string }> }) {
  if ((await searchParams).designed !== "1") notFound();
  return <EnterpriseStatement designed />;
}
